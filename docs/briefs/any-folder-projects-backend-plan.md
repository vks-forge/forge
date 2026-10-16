# Backend plan: any folder is a project (d-0124), Builder A

Findings from the investigation (graft + reading):

- Registration door: `assertProjectFolder` (absolute path, not in Forge data home), then
  `inspectRepository` (must be a repo ROOT with the base branch). `POST /projects/inspect` is the
  dry run of the same checks. Project row = `projects` table (`local_path`, `connection_id`, ...).
- Engine reaches git only through two ports: `WorktreeManager` (create/diff/commitAll/head/remove)
  and `GitHost` (push/findPr/openPr/prStatus/merge/deleteBranch). `merge()` has one caller,
  `engine/tick/verify-merge.ts`, after G1 passed and tier A. Verify failures that are
  `invalid_input` / `policy_denied` family park the ticket in WaitingHuman ("Needs you").
- Worker cwd = `worktree.path` (dispatch-run sets `run.cwd`); tool floors use `run.cwd`; G1 gets
  `worktreePath` and the manager's `diff()`; check commands run in `worktreePath`.
- `GitHost` is chosen by `settings.git_host.kind` in `server/services/git-host.ts`.
  `local` = bare repo + JSON PR records (`local-bare` adapter, plumbing merge with CAS).

## Design

1. Core (first): `GitInspection`, `SnapshotInspection`, `GitSetup`, `ProjectScope` in
   `schemas/onboarding.ts`; `ProjectInspection` gains `git` + `snapshot`; `Project` row gains
   `repo_root`, `subfolder`; `GitHostConfig` gains `{ kind: 'local_repo', base_branch }`.
2. Migration 0020: `projects.repo_root`, `projects.subfolder` (nullable). Sqlite repository maps them.
3. `packages/git`:
   - `inspectFolderGit()` (state repo/none/inside_repo, has_commits, dirty = tracked changes,
     remote origin/first + GitHub owner/repo parse in `domain/remote-url.ts`).
   - `scanSnapshot()`: counts what a snapshot commit would take via `git ls-files --others
     --exclude-standard` against a throwaway git dir (nothing is written to the user's folder),
     with the standard ignore list as excludesFile when no `.gitignore`; guard 20k files / 1 GB.
   - `initLocalRepo()`: guard first (typed `SnapshotTooLargeError`), refuse when already inside a
     repo (never nested), `git init` + `symbolic-ref HEAD`, write `.gitignore` only if missing,
     snapshot commit "Initial snapshot (Forge)" with `-c user.name/-c user.email` (global config
     untouched); undo `.git` and `.gitignore` if the commit fails.
   - `createLocalRepoGitHost()`: reuses the local-bare host over the repo's git common dir
     (PR records in `<gitdir>/forge-prs`); `push` is a no-op (worktrees share the repo); merge
     goes through the same merge-tree / commit-tree squash, then lands via an injected `land`
     step: base checked out somewhere -> tracked tree must be clean (else `GitHostError
     'dirty_tree'`, family invalid_input -> parked, Needs you) and then `git merge --ff-only`
     there (git itself refuses to clobber untracked files); not checked out -> `update-ref` CAS.
     No temporary worktree is needed (plumbing), never force, never reset.
   - Worktree manager `subfolder` option: worktree is cut from `repoRoot`; the returned `path`
     (= Worker cwd, ticket.worktree) is `<worktree>/<subfolder>`; every method resolves the
     worktree root from that; `diff()`/`changedFiles()` report paths relative to the scope dir and
     out-of-scope changes as `../x`; `commitAll`/`head`/`remove` use the root. A base ref with no
     commit -> `InvalidInputError` ("make a first commit ...").
4. `packages/gates`: `checkScope()` in G1: any diff path starting with `../` fails the gate.
5. `packages/engine`: dispatch-run catches `invalid_input` from `worktrees.create` and parks the
   ticket with the plain reason (init-only repo has no base commit) via `parkDispatch`.
6. `apps/server`: `services/project-inspect.ts` (builds `ProjectInspection` for repo / none /
   inside_repo), `services/project-placement.ts` (resolves git_setup / scope into local_path,
   repo_root, subfolder; 400 `git_setup_required`, `scope_required`, `snapshot_too_large`),
   `services/git-host.ts` builds `local_repo`, registry passes repo_root/subfolder to manager and
   host; `POST /projects` with no `git_host`/connection registers a `local_repo` project; git
   setup runs last, right before the row is saved. `assertProjectFolder` also refuses a missing
   folder (`not_a_directory`).

## Tests

- git (heavy): inspect-folder, snapshot-scan, init-local-repo, local-repo git host, scoped worktree.
- gates: scope check. engine: dispatch parks on unborn base. db: migration 0020.
- server: project-inspect + projects route cases; e2e `local-merge-flow` (no-git folder ->
  snapshot -> Worker -> G1 -> local merge -> done; init-only refusal; dirty-tree Needs you;
  subfolder project end to end).

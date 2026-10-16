# @forge/git

Git for tickets: the `WorktreeManager` adapter that shells out to the `git` binary, and the `GitHost` adapters (local bare repo, GitHub App) that push branches and open, check, merge and close PRs.

## Why it exists

Every Worker run happens in its own git worktree on its own branch, whatever the ticket size
(d-0059). That keeps the main checkout, and Forge's data home (database, secrets, runs), outside
the Worker's cwd where the outside-cwd floors deny it, and lets several tickets run at once.
The Director (engine) needs four things from git around a run: a clean tree cut from a known
base commit before dispatch, the truth about which files the Worker really changed (not its own
claim), a Forge-authored commit to open the PR from, and removal of the tree when the ticket
is Done or Cancelled. Without this package the engine would either work in the main checkout
or embed git calls in its core, breaking the port boundary (execution-plane.md §8).

Finished work then has to leave the worktree. Workers never push (d-0012), so the server pushes the
branch, opens a PR, lets the gates judge it and merges it. Where that remote lives differs (a bare repo
on disk for offline runs and the end-to-end fixture, GitHub through an App installation), and the
credential must never reach a Worker, argv or a log. The `GitHost` adapters here are that boundary (d-0062).

## What it does

Public API from `src/index.ts`:

- `inspectRepository({ path, baseBranch, gitBinary? })` checks a folder before a project is registered on it (read-only: no fetch, no checkout): it must be a folder, the root of a git repository, and `baseBranch` (a branch or a ref such as `origin/main`) must resolve to a commit. It returns `{ ok: true, baseSha }` or `{ ok: false, code, message }` with `code` one of `not_a_directory`, `not_a_repository`, `not_repository_root`, `base_branch_missing`; the folder and git's reported root are compared by real path (Windows short names, symlinks and junctions expanded); a base branch git could read as an option throws `InvalidInputError`.
- `inspectFolderGit({ path })` looks at any folder (d-0124): `state` `repo` (its own repository), `none` (no git) or `inside_repo` (a subfolder of one, with `repo_root` and `subfolder`), plus `has_commits`, `dirty` (tracked files changed) and the `remote` (origin, else the first; `github` parsed by `githubRepoOf`). Read-only.
- `scanSnapshot({ path, limits? })` counts what a snapshot commit of a folder with no repository would take in, by asking git against a throwaway git dir (nothing is written to the folder); the standard ignore list applies when the folder has no `.gitignore`. Stops past 20k files or 1 GB (`truncated`).
- `initLocalRepo({ path, branch, mode, limits? })` starts a repository in a folder with none: `snapshot` (size guard first, `.gitignore` written only when missing, commit "Initial snapshot (Forge)" as Forge via `-c` flags, so the user's git config is never written) or `init_only` (empty repository). Never inside another repository; a failed commit removes what it created. A snapshot above the guard throws `SnapshotTooLargeError`.
- `createLocalRepoGitHost({ repoRoot, baseBranch, now })` is the `GitHost` for a project with no remote: same PR records and squash merge as the bare host, but `push` is a no-op and the merge lands in the user's repository. Base checked out with changed tracked files: `GitHostError` `dirty_tree` (invalid_input family, the ticket parks in "Needs you"); checked out and clean: `git merge --ff-only` there (git refuses to overwrite untracked files); not checked out: compare-and-swap `update-ref`. Never forces or resets the user's tree.
- `listBranches({ path, limit?, gitBinary? })` returns `{ current, branches, truncated }`: the checked-out branch (null when detached) and up to `limit` (default 50) local branch names, alphabetical; read-only. The new-project form uses it to offer a base branch.
- `createGitWorktreeManager({ repoRoot, worktreeRoot, subfolder?, gitBinary?, author? })` returns a `WorktreeManager`
  (port in `@forge/core`). `gitBinary` defaults to `git`; `author` to `Forge <forge@localhost>`.
- `create(ticketId, branch, baseRef)`: adds `<worktreeRoot>/<ticketId>` (the data home's `worktrees/<projectSlug>`, outside the checkout, d-0098) on a new
  `branch` and returns `{ path, baseSha }` with `baseSha` resolved before the add. Calling it
  again for the same path and branch reuses the tree (`baseSha` = merge-base of `baseRef` and
  the branch). A path on another branch, a branch checked out elsewhere, a non-worktree
  directory in the way, or an unsafe ref raises `InvalidInputError`. If the branch exists but
  has no worktree (kept after `remove`), it is re-attached. Because trees sit outside the
  checkout, git never lists them as untracked and no ignore rule is written.
- With `subfolder` (a project scoped to a folder inside a repository, d-0124) worktrees are of the whole repository, `create` returns `<worktree>/<subfolder>` (the Worker's cwd) and every method accepts that path or the root. `diff` and `changedFiles` report paths relative to the subfolder and edits outside it as `../x` (G1 refuses them); `commitAll`, `head` and `remove` work on the root. A base ref with no commit (init-only repository) raises `InvalidInputError` ("make a first commit").
- `remove(path)`: `worktree remove --force` then `prune`; already gone is fine; branch kept.
- `changedFiles(path, baseSha)`: sorted, unique, repo-relative forward-slash paths that differ
  from `baseSha` (committed, modified, deleted) plus untracked non-ignored files.
- `commitAll(path, message)`: stages all, returns `null` if nothing is staged, else commits as
  the Forge author and returns the new HEAD sha.
- `head(path)`: the commit the worktree is at.
- `diff(path, baseSha)`: `{ files, patch }` for what changed since `baseSha`: committed, staged, unstaged and
  untracked (shown as added; ignored files are left out). Each file has status `A`, `M`, `D` or `R` (`oldPath`
  for renames, detected for tracked paths, so a rename of a still-untracked file reads as D plus A). The patch
  is the unified diff of the tracked changes plus an added-file patch per untracked file; the index is never touched.
  Every diff invocation passes `--text` (so a Worker-written `.gitattributes` `-diff` cannot replace hunks with
  `Binary files differ` and hide a disabled test) and `-c core.quotePath=false` (non-ASCII names stay readable in
  patch headers); `changedFiles` passes the same `-c` flag. Names with a quote, tab or backslash are still quoted by git;
  the gates treat a header they cannot parse as a finding.

- `createGitRepoReader({ gitBinary?, timeoutMs? })` returns a `RepoReader` (port in `@forge/core`): read-only views of the committed tree at HEAD for the Director's planning steps. Every call runs with `root` (the project folder, possibly a subfolder of the repository) as cwd, so results are relative to it. `headSha(root)`; `listTracked(root, glob?)` (regular files at HEAD, forward slashes, `globMatch` filter); `readAtHead(root, path, maxBytes)` returns `{ path, content, bytes, truncated }` with the cut made on a UTF-8 character boundary; `grepAtHead(root, pattern, glob?, maxHits)` is `git grep -E` on HEAD (no match gives `[]`, any other git failure a `CrashError`); `changedFiles(root, fromSha, toSha, paths)` is the subset of `git diff --name-only` that equals or lies under one of `paths`. A path that is empty, absolute, drive/UNC, holds control characters or `..`, is not in HEAD, is a directory, symlink, submodule or binary file, or a grep pattern that is empty, over 500 characters or holds control characters, raises `PolicyDeniedError`; a malformed sha raises `InvalidInputError`. Each git call has a timeout (default 30 s, `GitRunOptions.timeoutMs`).

GitHost adapters (the port is in `@forge/core`):

- `findPr(branch)` on both hosts returns the open PR whose head is `branch`, or null (closed and merged PRs are
  ignored); the local host scans its PR records, the GitHub host calls `GET /pulls?head=<owner>:<branch>&state=open`.
- `createLocalBareGitHost({ remotePath, baseBranch, now, gitBinary?, git?, author? })`: `push` runs
  `git push <remotePath> <branch>:<branch>` from the worktree. A PR is a JSON record
  `<remotePath>/forge-prs/<n>.json` (sequential numbers, atomic temp-and-rename writes, one open PR per
  branch, like GitHub). `prStatus` reads the record and computes `mergeable` with `git merge-tree --write-tree`.
  **Merge** happens inside the bare repo with plumbing, no clone or worktree: `merge-tree` computes the merged
  tree (a conflict raises a `policy_denied` `GitHostError` and moves nothing), `commit-tree` writes the commit
  (two parents for `merge`, a true `--no-ff` merge; one parent for `squash`), and `update-ref <base> <new> <old>`
  moves the base with a compare-and-swap, so a base that moved meanwhile fails instead of being overwritten.
  `merge(n, method, expectedHeadSha)` is pinned: under the PR lock the branch ref must equal `expectedHeadSha`, else a
  `HeadMovedError` and nothing moves. A merge that would change nothing (the base already holds the PR, e.g. the
  server died between `update-ref` and saving the record) is recorded as merged at the current base instead of
  writing an empty commit. Merging a closed or already merged PR is refused. `closePr` is idempotent; `deleteBranch` deletes the ref in
  the bare repo (a missing branch is fine, the base branch is refused).
- `createGitHubAppGitHost({ owner, repo, baseBranch, appId, installationId, privateKey, fetch?, apiBase?, gitBase?, now?, git? })`:
  an RS256 JWT is signed with `node:crypto` (`iat` now-60 s, `exp` now+9 min, `iss` the App id), exchanged at
  `POST /app/installations/{id}/access_tokens`, and the token is cached until 5 minutes before `expires_at`
  (concurrent callers share one mint). A 401, or a 403 that is not a quota, drops the cached token and retries the call
  once with a freshly minted one before surfacing `auth` (a revoked token or a reinstalled App). REST: create PR, get PR (`merged` maps to state `merged`),
  `PUT /pulls/{n}/merge` (with `sha: expectedHeadSha`; GitHub's 409 "Head branch was modified" becomes
  `HeadMovedError`, a 405/409 saying a branch "was modified" becomes the retryable `merge_busy`, any other 405/409 stays
  a `merge_refused` park), close (`PATCH state=closed`), `DELETE /git/refs/heads/{branch}` (already gone is fine).
  `gitAuthEnv()` (extra method, type `GitHubAppGitHost`) returns the same token-bearing child env that `push` uses, so a caller can run
  `git fetch` or `git ls-remote` against the repo (the live probe does); treat the values as secret and never log them.
  `push` runs `git push https://github.com/<owner>/<repo>.git <branch>:<branch>` with the token only in the child
  environment (see "Why this approach").
- `GitHostError` (extends `ForgeError`) carries `reason` and, for REST failures, `status`. 401 and a plain 403 are
  `auth`, a quota 403 and 429 are `rate_limit`, 404 and 422 are `invalid_input`, 405 and 409 (a merge GitHub
  refuses for good) are `policy_denied`, a merge refused only because a branch was just modified is `merge_busy`
  (family `rate_limit`, so the engine backs off), 5xx and network failures are `crash`. Messages cut the response body to 300
  characters and replace the token, the JWT and the base64 form of the push header with `[redacted]`.

Returned paths are absolute with forward slashes (`C:/data/worktrees/proj/FRG-1`), accepted by both
Node and git on Windows. Any git failure becomes a `CrashError` with the stderr tail.

## Why this approach

- Plain `git` through `execFile` with an args array, `shell: false`: a branch name or commit
  message can never become shell syntax. Branch and base ref are rejected if they start with
  `-` or hold control characters, and branches must pass `git check-ref-format --branch`.
  Rejected: building a shell command string (injection, quoting bugs on Windows paths).
- Commits run with `--no-verify`, `core.hooksPath` pointed at the null device, and
  `commit.gpgsign=false`: the tree is Worker-controlled, so its hooks must not run in Forge's
  process, and signing prompts must not hang a run. Author comes from `-c` and env both.
- `-z` output everywhere, so file names with spaces or newlines are safe.
- The RepoReader reads HEAD through `ls-tree`, `cat-file` and `grep ... HEAD`, never the working tree: untracked files, ignored secrets and uncommitted edits are invisible by construction, and what the Director sees is what a Worker's worktree starts from (d-0131). `GIT_LITERAL_PATHSPECS=1` makes `*` and `:(top)` in a model-chosen name plain characters; a grep pattern goes after `-e` so it can never be an option; shas must be hex. Binary files, symlinks and submodule entries are refused (a link could point outside the project; a binary only burns context). Rejected: `git ls-files` / reading the file from disk (sees staged-only and working-tree state).
- Always a worktree, never a feature branch in the main checkout (d-0059, superseding d-0011).
- The GitHub push token goes only through the child process environment: `GIT_CONFIG_COUNT=2`,
  `GIT_CONFIG_KEY_0=http.<gitBase>/.extraheader` (default `http.https://github.com/.extraheader`; for GitHub Enterprise Server the configured `gitBase`, normalised with a trailing slash),
  `GIT_CONFIG_VALUE_0=AUTHORIZATION: basic <base64(x-access-token:token)>`, plus `GIT_CONFIG_KEY_1=credential.helper` with an empty `GIT_CONFIG_VALUE_1` (resets the helper list so Git Credential Manager is never consulted) and `GIT_TERMINAL_PROMPT=0`. It is
  never in argv, the remote URL, a git config file or logs, and the header is scoped to the configured git base URL. This replaces
  the `GIT_ASKPASS` idea in the E2 brief: the same guarantee with no helper script or file on disk.
- Local merges use `merge-tree` / `commit-tree` / `update-ref` in the bare repo instead of a temporary clone:
  nothing to clean up after a crash, and the ref update is a compare-and-swap.
- The JWT is signed with `node:crypto` and REST calls use the built-in `fetch`: no Octokit (code.md rule 11).
- Local-first with the git CLI the user already has; PRs and pushes belong to the `GitHost`
  adapter (d-0052), not here.
- Rejected: libgit2 / isomorphic-git dependencies. Native or large deps with Windows caveats,
  and worktree support is incomplete in them (code.md rule 11).

## Requirements

- `git` >= 2.38 on PATH (`merge-tree --write-tree` for the local host; worktrees need 2.5); no environment
  variables read besides inheriting `process.env` for git itself. The GitHub host needs the App private key
  from a `SecretStore` (see `@forge/secrets`) and network access to api.github.com and github.com.
- The RepoReader needs only the `git` binary and a repository with at least one commit.
- No files under `.forge/`; the only file written outside worktrees is, for the local host, `<remotePath>/forge-prs/*.json`.
- Tests: `pnpm test`, or `npx vitest run packages/git`. They create throwaway repos in the OS
  temp dir (names with a space) and need `git` to run. The GitHub host tests use a fake REST server on
  127.0.0.1 that verifies the JWT signature, and test push through a recording git runner. Live GitHub is
  covered by probe 9 (`__tests__/probes/`, `pnpm probes` with `FORGE_PROBE_GITHUB=1` plus `FORGE_GH_APP_ID`, `FORGE_GH_INSTALLATION_ID`,
  `FORGE_GH_OWNER`, `FORGE_GH_REPO` set and the key stored as `github-app-key` in `.forge/data/secrets`).

## Extending

- A new GitHost (for example GitLab) goes in `src/adapters/<name>/`, throws `GitHostError`, and must pass
  `describeGitHostContract` from `__tests__/contract/git-host.contract.ts`.
- A new implementation (for example a remote or sandboxed worktree host) goes in
  `src/adapters/<name>/`, takes its dependencies as options, and must pass
  `describeWorktreeContract` from `__tests__/contract/worktree.contract.ts`. Add a
  `*.contract.test.ts` that calls it.
- `__tests__/helpers/fake-worktree.ts` is the in-memory fake the engine can mirror in its own
  tests; keep it passing the same contract.
- Pure rules (ref validation, porcelain parsing) live in `src/domain/`.

## Limits

- A snapshot commit does not look inside nested repositories in the folder (git records them as embedded repositories); the local repository host keeps its PR records under the repository's git folder (`forge-prs/`), and a repository whose branch is checked out in several worktrees is merged into the first one that holds it.
- No fetch or submodule handling; the worktree manager never pushes (only a GitHost does).
- The local host has no review, comments or branch protection; `mergeable` is only `merge-tree` conflict
  detection. Its PR numbering is serialised in-process, so run one server per remote path.
- The GitHub host reports `rate_limit` and leaves `Retry-After` handling to the engine.
- The 401 token refresh covers REST calls only; a `git push` that GitHub rejects for a revoked token fails as `unavailable`
  and succeeds on the engine's retry, which mints a new token.
- The response schemas (`schemas/github-responses.ts`) are read strictly; a field GitHub renames makes the host fail as
  `unavailable` rather than guess.
- `push` is never forced: a branch whose remote history diverged fails instead of being overwritten.
- `create` assumes the base ref is a local ref or sha; it does not fetch.
- Locked worktrees are not unlocked; a `remove` that cannot delete the directory raises.
- `changedFiles` reports a rename as a delete plus an add; `diff` detects renames only for tracked paths.
- RepoReader: `readAtHead` buffers the whole blob (git output is capped at 64 MB, larger files fail with `CrashError`) and decodes it as UTF-8, so a file in another encoding shows U+FFFD for bad bytes (its `bytes` size is exact). A repository with no commit fails `headSha` with `CrashError`. Submodules are not searched. `grepAtHead` filters by glob after git returns, so a very broad pattern still scans the whole folder.
- The fake does not model baseSha history; it tracks changes against the initial commit only.

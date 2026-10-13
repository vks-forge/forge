# @forge/git

Git worktrees for tickets: the `WorktreeManager` adapter that shells out to the `git` binary.

## Why it exists

Every Worker run happens in its own git worktree on its own branch, whatever the ticket size
(d-0059). That keeps the main checkout, and Forge's runtime data under `.forge/data`, outside
the Worker's cwd where the outside-cwd floors deny it, and lets several tickets run at once.
The Director (engine) needs four things from git around a run: a clean tree cut from a known
base commit before dispatch, the truth about which files the Worker really changed (not its own
claim), a Forge-authored commit to open the PR from, and removal of the tree when the ticket
is Done or Cancelled. Without this package the engine would either work in the main checkout
or embed git calls in its core, breaking the port boundary (execution-plane.md §8).

## What it does

Public API from `src/index.ts`:

- `createGitWorktreeManager({ repoRoot, gitBinary?, author? })` returns a `WorktreeManager`
  (port in `@forge/core`). `gitBinary` defaults to `git`; `author` to `Forge <forge@localhost>`.
- `create(ticketId, branch, baseRef)`: adds `<repoRoot>/.worktrees/<ticketId>` on a new
  `branch` and returns `{ path, baseSha }` with `baseSha` resolved before the add. Calling it
  again for the same path and branch reuses the tree (`baseSha` = merge-base of `baseRef` and
  the branch). A path on another branch, a branch checked out elsewhere, a non-worktree
  directory in the way, or an unsafe ref raises `InvalidInputError`. If the branch exists but
  has no worktree (kept after `remove`), it is re-attached. It also appends `/.worktrees/` to
  `<git-common-dir>/info/exclude` so the main checkout never lists trees as untracked (d-0039).
- `remove(path)`: `worktree remove --force` then `prune`; already gone is fine; branch kept.
- `changedFiles(path, baseSha)`: sorted, unique, repo-relative forward-slash paths that differ
  from `baseSha` (committed, modified, deleted) plus untracked non-ignored files.
- `commitAll(path, message)`: stages all, returns `null` if nothing is staged, else commits as
  the Forge author and returns the new HEAD sha.
- `head(path)`: the commit the worktree is at.

Returned paths are absolute with forward slashes (`C:/repo/.worktrees/FRG-1`), accepted by both
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
- Always a worktree, never a feature branch in the main checkout (d-0059, superseding d-0011).
- Local-first with the git CLI the user already has; PRs and pushes belong to the `GitHost`
  adapter (d-0052), not here.
- Rejected: libgit2 / isomorphic-git dependencies. Native or large deps with Windows caveats,
  and worktree support is incomplete in them (code.md rule 11).

## Requirements

- `git` >= 2.5 on PATH (worktrees); no environment variables read besides inheriting
  `process.env` for git itself.
- No files under `.forge/`; the only file written outside worktrees is
  `<git-common-dir>/info/exclude`.
- Tests: `pnpm test`, or `npx vitest run packages/git`. They create throwaway repos in the OS
  temp dir (names with a space) and need `git` to run.

## Extending

- A new implementation (for example a remote or sandboxed worktree host) goes in
  `src/adapters/<name>/`, takes its dependencies as options, and must pass
  `describeWorktreeContract` from `__tests__/contract/worktree.contract.ts`. Add a
  `*.contract.test.ts` that calls it.
- `__tests__/helpers/fake-worktree.ts` is the in-memory fake the engine can mirror in its own
  tests; keep it passing the same contract.
- Pure rules (ref validation, porcelain parsing) live in `src/domain/`.

## Limits

- No fetch, push, merge or PR operations; no submodule handling.
- `create` assumes the base ref is a local ref or sha; it does not fetch.
- Locked worktrees are not unlocked; a `remove` that cannot delete the directory raises.
- `changedFiles` reports a rename as a delete plus an add.
- The fake does not model baseSha history; it tracks changes against the initial commit only.

# @forge/git

Git for tickets: the `WorktreeManager` adapter that shells out to the `git` binary, and the `GitHost` adapters (local bare repo, GitHub App) that push branches and open, check, merge and close PRs.

## Why it exists

Every Worker run happens in its own git worktree on its own branch, whatever the ticket size
(d-0059). That keeps the main checkout, and Forge's runtime data under `.forge/data`, outside
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
- `diff(path, baseSha)`: `{ files, patch }` for what changed since `baseSha`: committed, staged, unstaged and
  untracked (shown as added; ignored files are left out). Each file has status `A`, `M`, `D` or `R` (`oldPath`
  for renames, detected for tracked paths, so a rename of a still-untracked file reads as D plus A). The patch
  is the unified diff of the tracked changes plus an added-file patch per untracked file; the index is never touched.
  Every diff invocation passes `--text` (so a Worker-written `.gitattributes` `-diff` cannot replace hunks with
  `Binary files differ` and hide a disabled test) and `-c core.quotePath=false` (non-ASCII names stay readable in
  patch headers); `changedFiles` passes the same `-c` flag. Names with a quote, tab or backslash are still quoted by git;
  the gates treat a header they cannot parse as a finding.

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
- No files under `.forge/`; the only files written outside worktrees are `<git-common-dir>/info/exclude` and,
  for the local host, `<remotePath>/forge-prs/*.json`.
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
- The fake does not model baseSha history; it tracks changes against the initial commit only.

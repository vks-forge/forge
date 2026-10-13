/**
 * Types for the git-CLI worktree manager.
 *
 * Why: the manager is composed by the app from plain config (which repo, which git, who
 *   authors commits) and talks to git through a small process runner; naming those shapes
 *   once keeps the adapter files short and lets tests fake the runner.
 *
 * Exports: GitWorktreeManagerOptions, GitAuthor, ParsedWorktree, GitResult, GitRunOptions, GitRunner.
 * Depends on: none. Types only.
 */

/** Identity stamped on every commit Forge makes. */
export interface GitAuthor {
  readonly name: string;
  readonly email: string;
}

/** Options for `createGitWorktreeManager`. */
export interface GitWorktreeManagerOptions {
  /** The main checkout; worktrees are created under `<repoRoot>/.worktrees`. */
  readonly repoRoot: string;
  /** Git executable; defaults to `git` on PATH. */
  readonly gitBinary?: string;
  /** Commit author and committer; defaults to Forge <forge@localhost>. */
  readonly author?: GitAuthor;
}

/** One entry of `git worktree list --porcelain`. `branch` is the short name, null if detached or bare. */
export interface ParsedWorktree {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
}

/** Outcome of a git process that was allowed to fail. */
export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Per-call options for the git runner. */
export interface GitRunOptions {
  readonly env?: Readonly<Record<string, string>>;
}

/** Runs git in a directory. `run` throws CrashError on failure; `try` returns the exit code instead. */
export interface GitRunner {
  run(cwd: string, args: readonly string[], opts?: GitRunOptions): Promise<string>;
  try(cwd: string, args: readonly string[], opts?: GitRunOptions): Promise<GitResult>;
}

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
  /** The project's checkout; every git command runs here (or in a worktree). */
  readonly repoRoot: string;
  /**
   * Folder holding one directory per ticket, outside the checkout (the data home's
   * `worktrees/<projectSlug>`), so the user's own folder never shows Forge worktrees (d-0098).
   */
  readonly worktreeRoot: string;
  /**
   * Path of the project's folder inside `repoRoot`, forward slashes, when the project is
   * scoped to a subfolder (d-0124). Worktrees are of the whole repository; the path handed
   * out (the Worker's cwd) is this folder inside the worktree.
   */
  readonly subfolder?: string;
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
  /** Kill git after this many milliseconds; a killed run is a CrashError. No limit when absent. */
  readonly timeoutMs?: number;
}

/** Runs git in a directory. `run` throws CrashError on failure; `try` returns the exit code instead. */
export interface GitRunner {
  run(cwd: string, args: readonly string[], opts?: GitRunOptions): Promise<string>;
  try(cwd: string, args: readonly string[], opts?: GitRunOptions): Promise<GitResult>;
}

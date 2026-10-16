/**
 * Types for looking at a folder with git, counting a snapshot and starting a local repository.
 *
 * Why: any folder can become a project (d-0124). Onboarding must learn, without changing
 *   anything, whether the folder has git and what a first snapshot would take in, and on
 *   confirmation start a repository in it. Naming the option bags once keeps the three
 *   adapter files short and lets tests pick small size guards.
 *
 * Exports: FolderGitOptions, SnapshotScanOptions, SnapshotLimits, InitLocalRepoOptions, InitLocalRepoResult.
 * Depends on: types/git-worktree (GitAuthor). Types only.
 */

import type { GitAuthor } from '#/types/git-worktree.types.js';

export interface FolderGitOptions {
  readonly path: string;
  readonly gitBinary?: string;
}

/** Above either number a snapshot commit is refused: the user should add ignores first. */
export interface SnapshotLimits {
  readonly maxFiles: number;
  readonly maxBytes: number;
}

export interface SnapshotScanOptions extends FolderGitOptions {
  readonly limits?: SnapshotLimits;
}

export interface InitLocalRepoOptions extends SnapshotScanOptions {
  /** Name of the first branch. */
  readonly branch: string;
  /** `snapshot` commits the existing files; `init_only` leaves the repository empty. */
  readonly mode: 'snapshot' | 'init_only';
  /** Identity of the snapshot commit, given with `-c`; the user's git config is never written. */
  readonly author?: GitAuthor;
}

export interface InitLocalRepoResult {
  /** The snapshot commit, or null for `init_only`. */
  readonly commit: string | null;
  /** True when Forge wrote the standard `.gitignore` (the folder had none). */
  readonly wroteGitignore: boolean;
}

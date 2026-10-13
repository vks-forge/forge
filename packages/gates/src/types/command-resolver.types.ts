/**
 * Types for the command resolver.
 *
 * Why: resolving a project command to an absolute executable must be testable without a
 *   disk or a real PATH, so the filesystem and environment are passed in as a seam.
 *
 * Exports: ResolveSeam, ResolveResult.
 * Depends on: none. Types only.
 */

/** What the resolver may look at: the environment, the worktree and a file-exists probe. */
export interface ResolveSeam {
  readonly platform: 'win32' | 'posix';
  /** The Worker's worktree; nothing inside it may be executed. */
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly isFile: (path: string) => boolean;
}

export type ResolveResult =
  | { readonly ok: true; readonly command: string }
  | { readonly ok: false; readonly reason: string };

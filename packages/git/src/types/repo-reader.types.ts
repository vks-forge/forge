/**
 * Options of the git-CLI RepoReader.
 *
 * Why: the reader runs git against project folders the user chose; the binary and the time
 *   limit must be configurable (a portable git, a slow network drive) without the adapter
 *   reading the environment itself.
 *
 * Exports: GitRepoReaderOptions, TreeEntry.
 * Depends on: none. Types only.
 */

/** Options for `createGitRepoReader`. */
export interface GitRepoReaderOptions {
  /** The git executable; defaults to `git` on PATH. */
  readonly gitBinary?: string;
  /** Kill any single git call after this many milliseconds; defaults to 30 000. */
  readonly timeoutMs?: number;
}

/** One line of `git ls-tree`: file mode, object id and the name relative to the cwd. */
export interface TreeEntry {
  readonly mode: string;
  readonly sha: string;
  readonly name: string;
}

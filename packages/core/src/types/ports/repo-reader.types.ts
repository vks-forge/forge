/**
 * RepoReader port — read-only views of a project's git-tracked files at HEAD.
 *
 * Why: the Director's planning steps must look at the code to judge blast radius and overlap
 *   (d-0131), but a model's reading must never reach untracked files, secrets in the working
 *   tree, other folders or anything it could change. Reading the committed tree at HEAD
 *   guarantees all four at once: what the Director sees is what a Worker's worktree starts from
 *   and nothing else. The engine owns the reads (it runs them through `admit()` and caps them),
 *   so this port stays a thin, harness-neutral way to ask git. An unsafe path (traversal,
 *   absolute, untracked, ignored) is refused with a PolicyDeniedError, never read.
 *
 * Exports: RepoFile, RepoGrepHit, RepoReader.
 * Depends on: none. Types only.
 */

/** A tracked file read at HEAD; `truncated` is set when the content was cut at `maxBytes`. */
export interface RepoFile {
  readonly path: string;
  readonly content: string;
  /** Size of the whole file at HEAD in bytes, not of the truncated content. */
  readonly bytes: number;
  readonly truncated: boolean;
}

/** One matching line of a grep at HEAD; `path` is relative to the project root. */
export interface RepoGrepHit {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

export interface RepoReader {
  // The commit HEAD points at in the repository containing `root`.
  headSha(root: string): Promise<string>;
  // Tracked files under `root` (paths relative to it, forward slashes), optionally only those matching `glob`.
  listTracked(root: string, glob?: string): Promise<string[]>;
  // The tracked file at HEAD, cut at `maxBytes`. PolicyDeniedError for traversal, absolute or untracked paths.
  readAtHead(root: string, path: string, maxBytes: number): Promise<RepoFile>;
  // Lines of tracked files at HEAD matching the regular expression, at most `maxHits`, optionally within `glob`.
  grepAtHead(
    root: string,
    pattern: string,
    glob: string | undefined,
    maxHits: number,
  ): Promise<RepoGrepHit[]>;
  // Which of `paths` (files or folders under `root`) changed between the two commits; subset of the changed paths, relative to `root`.
  changedFiles(
    root: string,
    fromSha: string,
    toSha: string,
    paths: readonly string[],
  ): Promise<string[]>;
}

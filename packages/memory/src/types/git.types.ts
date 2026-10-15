/**
 * Types shared by the memory git runner and the readers built on it.
 *
 * Why: the git runner, the committed-file reader and the record loaders all pass the same
 *   few shapes between them; one file keeps them from being declared twice.
 *
 * Exports: CommittedFile, GitSandbox, OnSkip.
 * Depends on: nothing. Types only.
 */

/** One committed markdown file. `relPath` uses forward slashes. */
export interface CommittedFile {
  readonly relPath: string;
  readonly text: string;
}

/** Empty folders and files git runs with, so none of the owner's own setup applies. */
export interface GitSandbox {
  readonly home: string;
  readonly hooks: string;
  readonly template: string;
  readonly config: string;
}

/** Reports a file or folder that was ignored, with its path and why. */
export type OnSkip = (path: string, reason: string) => void;

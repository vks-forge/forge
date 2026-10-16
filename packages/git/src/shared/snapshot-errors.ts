/**
 * The error raised when a folder is too big for a snapshot commit.
 *
 * Why: committing a dependency tree or a data dump as "the first snapshot" would freeze
 *   gigabytes into the user's history. The onboarding route must tell this apart from a
 *   bad input in general so the form can say "add ignores first" with the real numbers.
 *
 * Exports: SnapshotTooLargeError.
 * Depends on: @forge/core (InvalidInputError). No IO.
 */

import { InvalidInputError } from '@forge/core';

export class SnapshotTooLargeError extends InvalidInputError {
  readonly files: number;
  readonly bytes: number;

  constructor(files: number, bytes: number) {
    super(
      `the folder holds too many files to snapshot (${files}+ files, ${Math.round(bytes / 1048576)} MB so far); add a .gitignore for generated or large folders and try again`,
    );

    this.files = files;
    this.bytes = bytes;
  }
}

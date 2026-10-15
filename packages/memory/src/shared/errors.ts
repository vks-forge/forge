/**
 * Memory repository integrity errors.
 *
 * Why: the Director plans from the records in a project's memory repository. When the
 *   repository contradicts itself (one record id in two files after a crash) it must stop
 *   and say exactly which files, not pick one and plan from a guess. Callers read the
 *   `crash` family, never the message.
 *
 * Exports: MemoryIntegrityError.
 * Depends on: @forge/core (CrashError).
 */

import { CrashError } from '@forge/core';

/** The repository holds one record id in more than one file. */
export class MemoryIntegrityError extends CrashError {
  readonly recordId: string;
  readonly paths: readonly string[];

  constructor(recordId: string, paths: readonly string[]) {
    super(`memory record ${recordId} exists in more than one file: ${paths.join(', ')}`);
    this.recordId = recordId;
    this.paths = paths;
  }
}

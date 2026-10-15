/**
 * Memory errors — a record that is missing and a record in the wrong state.
 *
 * Why: the memory API must tell "no such record" (404) from "that proposal was already
 *   decided" (409) without reading message text, and an approval racing a rejection must
 *   fail loudly rather than overwrite the first answer. Both are caller errors, so they
 *   carry the `invalid_input` family and are never retried as-is.
 *
 * Exports: MemoryRecordNotFoundError, MemoryRecordStateError.
 * Depends on: shared/errors. No IO.
 */

import { InvalidInputError } from '#/shared/errors.js';

/** No record with this id in the project's memory. */
export class MemoryRecordNotFoundError extends InvalidInputError {
  readonly recordId: string;

  constructor(id: string) {
    super(`no memory record ${id}`);
    this.recordId = id;
  }
}

/** The record exists but its state forbids the change (not pending, not an active decision). */
export class MemoryRecordStateError extends InvalidInputError {
  readonly recordId: string;

  constructor(id: string, message: string) {
    super(message);
    this.recordId = id;
  }
}

/**
 * Maps backend failures onto the typed ForgeError hierarchy at the storage boundary.
 *
 * Why: the Director decides retry, stall and kill from `errorFamily` (code.md rule 7), but
 *   better-sqlite3 throws `SqliteError` and zod throws `ZodError`, which carry no family.
 *   Left raw, a busy database looks like a crash, a duplicate key looks like a harness
 *   fault and a corrupt row looks like nothing the engine can classify. Every error that
 *   leaves an adapter passes through here once: lock contention becomes `stall` (the
 *   writer is making no progress; retry later, as for a stalled run), constraint and
 *   rejected-input failures become `invalid_input` (a caller bug, never retried as-is),
 *   anything else from the engine becomes `unknown` (fail closed). The original error
 *   stays on `cause`. Errors that are already ForgeErrors, and the caller's own
 *   exceptions thrown from a transaction callback, pass through unchanged.
 *
 * Exports: mapDbError(), parseStored().
 * Depends on: @forge/core. No IO.
 */

import {
  ForgeError,
  InvalidInputError,
  StallError,
  UnknownForgeError,
} from '@forge/core';

const hasCode = (e: unknown): e is { code: string } =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as { code?: unknown }).code === 'string' &&
  (e as { code: string }).code.startsWith('SQLITE_');

const isZodError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'ZodError';

/** Classify `error` for the Director; ForgeErrors and unrelated exceptions are returned as they are. */
export function mapDbError(error: unknown): unknown {
  if (error instanceof ForgeError) {
    return error;
  }

  if (hasCode(error)) {
    const { code } = error;
    const message = (error as { message?: string }).message ?? code;
    if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) {
      return new StallError(`database is busy (${code}): ${message}`, { cause: error });
    }

    if (code.startsWith('SQLITE_CONSTRAINT')) {
      return new InvalidInputError(`constraint violated (${code}): ${message}`, {
        cause: error,
      });
    }

    return new UnknownForgeError(`database error (${code}): ${message}`, {
      cause: error,
    });
  }

  if (isZodError(error)) {
    return new InvalidInputError('value rejected by schema validation', {
      cause: error,
    });
  }

  return error;
}

/** Parse a stored row; a failure means the database holds data this version cannot read, which is `unknown` (fail closed), not caller input. */
export function parseStored<T>(
  schema: { parse(value: unknown): T },
  value: unknown,
  what: string,
): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new UnknownForgeError(`stored ${what} failed validation`, { cause: error });
  }
}

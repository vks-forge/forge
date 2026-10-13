/**
 * Argument validation for values handed to git as refs.
 *
 * Why: branch and base-ref names originate in tickets and config. A value starting with `-`
 *   is parsed by git as an option (`--upload-pack=...` runs a program), and NUL or newlines
 *   corrupt `-z` and porcelain parsing. Refusing them before any process is spawned closes
 *   argument injection regardless of how the caller got the string.
 *
 * Exports: assertSafeRefArg().
 * Depends on: @forge/core (InvalidInputError). No IO.
 */

import { InvalidInputError } from '@forge/core';

/** Throws InvalidInputError unless `value` is a non-empty string git cannot read as an option. */
export function assertSafeRefArg(label: string, value: string): void {
  if (value.length === 0) throw new InvalidInputError(`${label} must not be empty`);
  if (value.startsWith('-'))
    throw new InvalidInputError(`${label} must not start with '-'`);
  if (/[\0\r\n]/.test(value))
    throw new InvalidInputError(`${label} contains a control character`);
}

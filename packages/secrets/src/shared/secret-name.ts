/**
 * Secret-name check shared by every SecretStore adapter.
 *
 * Why: a secret name becomes a file name under the store directory. Every adapter must
 *   refuse a name that could climb out of it (`../x`, `a/b`, drive letters) before any
 *   path is built, with the same typed error, so one adapter cannot be laxer than another.
 *
 * Exports: assertSecretName().
 * Depends on: @forge/core (SecretName, InvalidInputError). No IO.
 */

import { InvalidInputError, SecretName } from '@forge/core';

/** Throws InvalidInputError unless `name` matches the core `SecretName` grammar. */
export function assertSecretName(name: string): void {
  if (!SecretName.safeParse(name).success)
    throw new InvalidInputError(
      `invalid secret name (use lowercase letters, digits and dashes): ${JSON.stringify(name).slice(0, 80)}`,
    );
}

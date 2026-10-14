/**
 * Secret-name checks shared by every SecretStore adapter.
 *
 * Why: a secret name becomes a path under the store directory. Every adapter must refuse
 *   a name or prefix that could climb out of it before any path is built, with the same
 *   typed error, so one adapter cannot be laxer than another and a bad name fails closed
 *   instead of reaching the disk.
 *
 * Exports: assertSecretName(), assertSecretPrefix().
 * Depends on: schemas/secret-name, shared/errors. No IO.
 */

import { SecretName, SecretNamePrefix } from '#/schemas/secret-name.js';
import { InvalidInputError } from '#/shared/errors.js';

const show = (value: string): string => JSON.stringify(value).slice(0, 80);

/** Throws InvalidInputError unless `name` matches the `SecretName` grammar. */
export function assertSecretName(name: string): void {
  if (!SecretName.safeParse(name).success) {
    throw new InvalidInputError(
      `invalid secret name (lowercase segments of letters, digits, ".", "_", "-" joined by "/"): ${show(name)}`,
    );
  }
}

/** Throws InvalidInputError unless `prefix` matches the `SecretNamePrefix` grammar. */
export function assertSecretPrefix(prefix: string): void {
  if (!SecretNamePrefix.safeParse(prefix).success) {
    throw new InvalidInputError(`invalid secret prefix: ${show(prefix)}`);
  }
}

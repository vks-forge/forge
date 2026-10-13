/**
 * SecretName schema — the grammar of secret identifiers.
 *
 * Why: a secret name becomes a file name on disk (`<name>.dpapi`) and appears in config.
 *   A strict lowercase-slug grammar means a name can never carry a path separator, a dot
 *   segment or a drive letter, so a hostile or mistyped name cannot escape the secrets
 *   directory (d-0062).
 *
 * Exports: SecretName.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const SecretName = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
export type SecretName = z.infer<typeof SecretName>;

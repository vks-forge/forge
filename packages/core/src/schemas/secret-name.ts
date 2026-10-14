/**
 * SecretName schema — the grammar of secret identifiers.
 *
 * Why: a secret name becomes a relative file path on disk (`github/acme/key` is
 *   `<dir>/github/acme/key.dpapi`) and appears in config. Namespaced names let the product
 *   keep GitHub keys, harness credentials and per-run secrets apart (d-0100), but a
 *   hostile or mistyped name must still never leave the secrets directory. The grammar is
 *   therefore strict: lowercase `/`-joined segments, no empty segment, no leading dot (so
 *   no `..`), no backslash or drive letter, no segment Windows treats as a device
 *   (`nul`, `com1`) or strips a trailing dot from, and no suffix an adapter uses for its
 *   own files (`.dpapi`, `.tmp`). A flat name such as `github-app-key` is one segment and
 *   stays valid (d-0062).
 *
 * Exports: SecretName, SecretNamePrefix, SECRET_NAME_MAX_LENGTH.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Longest accepted name or prefix, separators included. */
export const SECRET_NAME_MAX_LENGTH = 128;

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const ADAPTER_SUFFIXES = ['.dpapi', '.tmp'];

function isValidSegment(segment: string): boolean {
  if (!SEGMENT.test(segment) || segment.endsWith('.')) {
    return false;
  }

  if (WINDOWS_DEVICE.test(segment.split('.')[0] ?? '')) {
    return false;
  }

  return !ADAPTER_SUFFIXES.some((suffix) => segment.endsWith(suffix));
}

export const SecretName = z
  .string()
  .max(SECRET_NAME_MAX_LENGTH)
  .refine((name) => name.split('/').every(isValidSegment), {
    message: 'secret name must be lowercase segments [a-z0-9][a-z0-9._-]* joined by "/"',
  });
export type SecretName = z.infer<typeof SecretName>;

/**
 * A `list()` prefix: empty (everything), or complete segments each followed by `/`, with
 * an optional partial last segment (`harness/`, `github/acme/`, `harn`).
 */
export const SecretNamePrefix = z
  .string()
  .max(SECRET_NAME_MAX_LENGTH)
  .refine(
    (prefix) => {
      if (prefix === '') {
        return true;
      }

      const parts = prefix.split('/');
      const last = parts.pop() ?? '';

      return parts.every(isValidSegment) && (last === '' || SEGMENT.test(last));
    },
    {
      message:
        'secret prefix must be whole segments joined by "/" plus an optional partial segment',
    },
  );
export type SecretNamePrefix = z.infer<typeof SecretNamePrefix>;

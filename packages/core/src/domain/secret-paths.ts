/**
 * Secrets paths — which changed files keep a tier C change out of the Director's hands.
 *
 * Why: the Director may sign off a clean tier C change (d-0181), but never one that touches
 *   credentials: an unattended merge of an `.env`, a private key or a secrets folder is exactly the
 *   mistake an owner wants to see before it ships. The set is the env files, key and certificate
 *   files and secrets folders. Auth, migrations and billing paths in the project's tier C globs are
 *   exactly what the Director may sign when clean, so they are not secrets paths. Templates (`.env.example`, `.env.sample`) carry no secret and do not count.
 *
 * Exports: findSecretPath(), SECRET_PATH_GLOBS.
 * Depends on: shared/glob. No IO.
 */

import { globMatch } from '#/shared/glob.js';

/** Built-in secrets globs, matched at any depth and ignoring case. Easy to extend in one place. */
export const SECRET_PATH_GLOBS: readonly string[] = [
  '**/.env',
  '**/.env.*',
  '**/secrets/**',
  '**/secret/**',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/credentials*.json',
];

const TEMPLATE = /\.(example|sample)$/i;

/** The first changed path that is a secrets path, or null when the diff touches none. */
export function findSecretPath(paths: readonly string[]): string | null {
  return (
    paths.find(
      (p) => !TEMPLATE.test(p) && SECRET_PATH_GLOBS.some((g) => globMatch(g, p, true)),
    ) ?? null
  );
}

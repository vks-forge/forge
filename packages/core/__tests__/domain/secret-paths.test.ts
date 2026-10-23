/**
 * Pins which changed paths count as secrets paths for the Director's tier C sign-off.
 *
 * Why: the Director may sign a clean tier C change only when the diff touches no secrets (d-0181).
 *   A missed `.env` or key file would let an unattended merge carry credentials, while flagging the
 *   committed `.env.example` template would send harmless work to the owner for nothing.
 *
 * Pins: env files (`.env`, `.env.*`, nested) hit, `.example` and `.sample` templates do not; key,
 *   certificate and secrets-folder paths hit; paths the owner added to the tier C globs beyond the
 *   built-in three hit; the built-in three alone do not; matching ignores case and backslashes.
 * Depends on: src/domain/secret-paths, vitest.
 */

import { describe, expect, it } from 'vitest';
import { findSecretPath } from '#/domain/secret-paths.js';

describe('findSecretPath', () => {
  it('flags env files at any depth but not their example or sample templates', () => {
    expect(findSecretPath(['src/a.ts', '.env'])).toBe('.env');
    expect(findSecretPath(['apps/web/.env.local'])).toBe('apps/web/.env.local');
    expect(findSecretPath(['.env.example', 'apps/x/.env.sample'])).toBeNull();
  });

  it('flags key material and secrets folders', () => {
    expect(findSecretPath(['deploy/server.pem'])).toBe('deploy/server.pem');
    expect(findSecretPath(['config/secrets/db.json'])).not.toBeNull();
    expect(findSecretPath(['keys/id_rsa'])).not.toBeNull();
  });

  it('does not flag auth, billing or Forge policy paths: those are what a clean tier C may touch', () => {
    expect(
      findSecretPath(['src/auth/login.ts', 'billing/stripe.ts', '.forge/memory/x.md']),
    ).toBeNull();
  });

  it('ignores case and Windows separators', () => {
    const win = String.raw`App\.ENV`;

    expect(findSecretPath([win])).toBe(win);
  });

  it('returns null for a clean diff', () => {
    expect(findSecretPath(['src/auth/login.ts'])).toBeNull();
    expect(findSecretPath([])).toBeNull();
  });
});

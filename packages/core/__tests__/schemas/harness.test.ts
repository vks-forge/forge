/**
 * Pins the harness row and secret-name grammar.
 *
 * Why: the harness id becomes a segment of the SecretStore name that holds an API key or
 *   OAuth token. If an id like `../x` or an unknown auth mode were accepted, a credential
 *   could be stored outside `harness/` or a run could start in a mode the driver does not
 *   implement, so both must fail at the boundary.
 *
 * Pins: Harness, HarnessAuthMode, harnessSecretName().
 * Depends on: src/index.
 */

import { describe, expect, it } from 'vitest';
import {
  Harness,
  HarnessAuthMode,
  InvalidInputError,
  harnessSecretName,
} from '#/index.js';

describe('Harness', () => {
  it('accepts a minimal row and optional fields', () => {
    expect(
      Harness.parse({
        id: 'claude',
        kind: 'claude',
        auth_mode: 'login',
        status: 'unknown',
      }),
    ).toEqual({ id: 'claude', kind: 'claude', auth_mode: 'login', status: 'unknown' });

    expect(
      Harness.safeParse({
        id: 'claude-2',
        kind: 'claude',
        binary_path: 'C:/bin/claude.exe',
        version: '2.1.299',
        auth_mode: 'api_key',
        status: 'ok',
        last_checked_at: '2026-10-14T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown auth mode, kind and a path-like id', () => {
    const base = { id: 'claude', kind: 'claude', auth_mode: 'login', status: 'ok' };
    expect(HarnessAuthMode.safeParse('password').success).toBe(false);
    expect(Harness.safeParse({ ...base, kind: 'codex' }).success).toBe(false);
    expect(Harness.safeParse({ ...base, id: '../x' }).success).toBe(false);
    expect(Harness.safeParse({ ...base, id: 'Claude' }).success).toBe(false);
  });
});

describe('harnessSecretName', () => {
  it('builds the namespaced names', () => {
    expect(harnessSecretName('claude', 'api_key')).toBe('harness/claude/api-key');
    expect(harnessSecretName('claude', 'oauth_token')).toBe('harness/claude/oauth-token');
  });

  it('refuses an id that is not a plain slug', () => {
    expect(() => harnessSecretName('a/b', 'api_key')).toThrow(InvalidInputError);
    expect(() => harnessSecretName('..', 'api_key')).toThrow(InvalidInputError);
  });
});

/**
 * Pins: the per-run hook config file accepts a well-formed record and rejects a bad URL.
 *
 * Why: the hook process reads this file on every tool call and has no other channel to
 * learn its server and token, so a malformed file must fail closed instead of posting to
 * a wrong place.
 *
 * Depends on: src/schemas/claude-hook-config.
 */

import { describe, expect, it } from 'vitest';
import { HOOK_CONFIG_ENV, HookConfig } from '#/schemas/claude-hook-config.js';

describe('HookConfig', () => {
  const cfg = {
    run_id: 'r',
    server_url: 'http://127.0.0.1:1',
    token: 't',
    timeout_ms: 1,
  };

  it('accepts a complete record', () => {
    expect(HookConfig.safeParse(cfg).success).toBe(true);
    expect(HOOK_CONFIG_ENV).toBe('FORGE_HOOK_CONFIG');
  });

  it('rejects a non-URL server and a missing token', () => {
    expect(HookConfig.safeParse({ ...cfg, server_url: 'nope' }).success).toBe(false);
    expect(HookConfig.safeParse({ ...cfg, token: '' }).success).toBe(false);
  });
});

/**
 * Pins: the in-memory registry of per-run bearer tokens and HMAC secrets.
 *
 * Why: the receipt secret exists only in server memory (d-0054), so the registry is what
 * lets the hook route and gate G1 agree on it. Each run gets its own long secret; a run
 * id is prepared once (a resume is a new run, d-0055) so a second registration is refused
 * rather than silently replacing the secret its chain was signed with; and the registry
 * stays bounded.
 *
 * Depends on: src/server/run-secrets. No IO.
 */

import { InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createRunSecretRegistry } from '#/index.js';

describe('run secret registry', () => {
  it('creates a long secret per run and serves token and secret back', async () => {
    const registry = createRunSecretRegistry();
    const creds = registry.register('run-1', 'token-a');

    expect(String(creds.secret).length).toBeGreaterThanOrEqual(32);
    expect((await registry.credentials('run-1'))?.token).toBe('token-a');
    expect(registry.secret('run-1')).toBe(creds.secret);
  });

  it('refuses to register the same run twice instead of replacing its secret', () => {
    const registry = createRunSecretRegistry();
    const first = registry.register('run-1', 'token-a');

    expect(() => registry.register('run-1', 'token-b')).toThrow(InvalidInputError);
    expect(registry.secret('run-1')).toBe(first.secret);
  });

  it('gives different runs different secrets and unknown runs nothing', async () => {
    const registry = createRunSecretRegistry();

    expect(registry.register('a', 't').secret).not.toBe(
      registry.register('b', 't').secret,
    );

    expect(await registry.credentials('missing')).toBeNull();
    expect(registry.secret('missing')).toBeNull();
  });

  it('evicts the oldest run beyond its cap', () => {
    const registry = createRunSecretRegistry(undefined, 2);
    registry.register('a', 't');
    registry.register('b', 't');
    registry.register('c', 't');

    expect(registry.size()).toBe(2);
    expect(registry.secret('a')).toBeNull();
    expect(registry.secret('c')).not.toBeNull();
  });
});

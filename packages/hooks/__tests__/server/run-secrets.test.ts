/**
 * Pins: the registry of per-run bearer tokens and HMAC secrets, with secrets kept in the
 * SecretStore for the life of the run.
 *
 * Why: receipts are signed with a per-run secret and gate G1 must be able to verify them
 * after the server restarted (d-0100). The secret therefore lives in the SecretStore as
 * `run/<runId>/secret-g<generation>`, one per generation, and the registry reads through to
 * it when its memory misses. The bearer token never leaves memory, so after a restart the
 * old Worker's token is unknown and its hook calls are refused until a resume registers a
 * new generation. A generation is registered once (a second registration would replace the
 * secret its receipts were signed with), all generations are deleted when the run is
 * retired, and the sweep deletes what a crash left behind for runs that are over.
 *
 * Depends on: src/server/run-secrets, @forge/secrets (memory store). No IO.
 */

import { InvalidInputError } from '@forge/core';
import { createFakeSecretStore as createMemorySecretStore } from '#tests/helpers/secret-store.js';
import { describe, expect, it } from 'vitest';
import { createRunSecretRegistry } from '#/index.js';

const NAME = (run: string, g: number): string => `run/${run}/secret-g${g}`;

describe('run secret registry', () => {
  it('creates a long secret per run and serves token, generation and secret back', async () => {
    const registry = createRunSecretRegistry();
    const creds = await registry.register('run-1', 'token-a');

    expect(String(creds.secret).length).toBeGreaterThanOrEqual(32);
    expect(creds.generation).toBe(1);
    expect((await registry.credentials('run-1'))?.token).toBe('token-a');
    expect(await registry.secret('run-1', 1)).toBe(creds.secret);
  });

  it('refuses to register the same generation twice instead of replacing its secret', async () => {
    const registry = createRunSecretRegistry();
    const first = await registry.register('run-1', 'token-a');

    await expect(registry.register('run-1', 'token-b')).rejects.toThrow(
      InvalidInputError,
    );

    expect(await registry.secret('run-1', 1)).toBe(first.secret);
  });

  it('gives different runs different secrets and unknown runs nothing', async () => {
    const registry = createRunSecretRegistry();

    expect((await registry.register('a', 't')).secret).not.toBe(
      (await registry.register('b', 't')).secret,
    );

    expect(await registry.credentials('missing')).toBeNull();
    expect(await registry.secret('missing', 1)).toBeNull();
  });

  it('evicts the oldest run from memory beyond its cap', async () => {
    const registry = createRunSecretRegistry({ max: 2 });
    await registry.register('a', 't');
    await registry.register('b', 't');
    await registry.register('c', 't');

    expect(registry.size()).toBe(2);
    expect(await registry.secret('a', 1)).toBeNull();
    expect(await registry.secret('c', 1)).not.toBeNull();
  });

  describe('with a SecretStore', () => {
    it('stores the secret as run/<id>/secret-g1 and never the token', async () => {
      const store = createMemorySecretStore();
      const registry = createRunSecretRegistry({ store });
      const creds = await registry.register('run-1', 'token-a');

      expect(await store.list('run/')).toEqual([NAME('run-1', 1)]);
      expect(
        Buffer.from((await store.get(NAME('run-1', 1))) ?? []).toString('utf8'),
      ).toBe(creds.secret);
    });

    it('keeps every generation: the current credentials are the newest, old secrets stay readable', async () => {
      const store = createMemorySecretStore();
      const registry = createRunSecretRegistry({ store });
      const one = await registry.register('run-1', 'token-1');
      const two = await registry.register('run-1', 'token-2', 2);

      expect(two.secret).not.toBe(one.secret);
      expect(await registry.credentials('run-1')).toMatchObject({
        token: 'token-2',
        generation: 2,
      });

      expect(await registry.secret('run-1', 1)).toBe(one.secret);
      expect(await registry.secret('run-1', 2)).toBe(two.secret);
      expect(await store.list('run/run-1/')).toEqual([
        NAME('run-1', 1),
        NAME('run-1', 2),
      ]);
    });

    it('reads through to the store after a restart; the token is gone, so credentials are null', async () => {
      const store = createMemorySecretStore();
      const before = await createRunSecretRegistry({ store }).register(
        'run-1',
        'token-a',
      );

      const after = createRunSecretRegistry({ store });

      expect(await after.secret('run-1', 1)).toBe(before.secret);
      expect(await after.credentials('run-1')).toBeNull();
    });

    it('refuses to register a generation whose secret the store already holds', async () => {
      const store = createMemorySecretStore();
      await createRunSecretRegistry({ store }).register('run-1', 'token-a');

      await expect(
        createRunSecretRegistry({ store }).register('run-1', 'token-b'),
      ).rejects.toThrow(InvalidInputError);
    });

    it('a resume after a restart registers generation 2 and still reads generation 1', async () => {
      const store = createMemorySecretStore();
      const one = await createRunSecretRegistry({ store }).register('run-1', 'token-a');
      const restarted = createRunSecretRegistry({ store });
      const two = await restarted.register('run-1', 'token-b', 2);

      expect(await restarted.secret('run-1', 1)).toBe(one.secret);
      expect(await restarted.secret('run-1', 2)).toBe(two.secret);
      expect((await restarted.credentials('run-1'))?.generation).toBe(2);
    });

    it('retire deletes every generation from memory and the store, and only that run', async () => {
      const store = createMemorySecretStore();
      const registry = createRunSecretRegistry({ store });
      await registry.register('run-1', 't');
      await registry.register('run-1', 't', 2);
      await registry.register('run-2', 't');

      await registry.retire('run-1');

      expect(await store.list('run/')).toEqual([NAME('run-2', 1)]);
      expect(await registry.secret('run-1', 1)).toBeNull();
      expect(await registry.credentials('run-1')).toBeNull();
      expect(await registry.secret('run-2', 1)).not.toBeNull();
    });

    it('retire is idempotent', async () => {
      const registry = createRunSecretRegistry({ store: createMemorySecretStore() });

      await expect(registry.retire('run-9')).resolves.toBeUndefined();
    });

    it('sweep retires the runs the predicate calls over and reports them', async () => {
      const store = createMemorySecretStore();
      const registry = createRunSecretRegistry({ store });
      await registry.register('run-1', 't');
      await registry.register('run-2', 't');
      await registry.register('run-3', 't');

      const swept = await registry.sweep(async (id) => id !== 'run-2');

      expect(swept.sort()).toEqual(['run-1', 'run-3']);
      expect(await store.list('run/')).toEqual([NAME('run-2', 1)]);
    });

    it('sweep leaves a run alone when the predicate throws', async () => {
      const store = createMemorySecretStore();
      const registry = createRunSecretRegistry({ store });
      await registry.register('run-1', 't');

      await expect(
        registry.sweep(async () => {
          throw new Error('storage down');
        }),
      ).rejects.toThrow('storage down');

      expect(await store.list('run/')).toEqual([NAME('run-1', 1)]);
    });
  });
});

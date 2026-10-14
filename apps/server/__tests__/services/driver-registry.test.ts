/**
 * Driver registry and lazy secret store.
 *
 * Why: the engine picks a ticket's harness by id and keeps that driver with the run, so an
 *   unknown id must read as "none" (the engine parks the ticket) and two drivers claiming
 *   one id must be refused at start, or the second would silently take over the first's
 *   runs. The secret store is created lazily so a server with only local projects (or off
 *   Windows) never builds the DPAPI store, yet a project that needs it fails at that call.
 *
 * Pins: lookup by id, null for unknown, sorted ids, duplicate id refused; the store factory
 *   runs once, at the first call of any method, and never when unused.
 * Depends on: src/services/driver-registry, src/services/lazy-secrets, @forge/secrets. No IO.
 */

import { InvalidInputError } from '@forge/core';
import type { WorkerDriver } from '@forge/core';
import { createMemorySecretStore } from '@forge/secrets';
import { describe, expect, it, vi } from 'vitest';
import { createDriverRegistry } from '#/services/driver-registry.js';
import { createLazySecretStore } from '#/services/lazy-secrets.js';

const driver = (id: string) => ({ id }) as unknown as WorkerDriver;

describe('createDriverRegistry', () => {
  it('finds a driver by its harness id and lists the ids sorted', () => {
    const claude = driver('claude-code');
    const registry = createDriverRegistry([driver('codex'), claude]);

    expect(registry.get('claude-code')).toBe(claude);
    expect(registry.ids()).toEqual(['claude-code', 'codex']);
  });

  it('answers null for a harness that is not installed', () => {
    expect(createDriverRegistry([driver('claude-code')]).get('opencode')).toBeNull();
    expect(createDriverRegistry([]).ids()).toEqual([]);
  });

  it('refuses two drivers with one id', () => {
    expect(() => createDriverRegistry([driver('a'), driver('a')])).toThrow(
      InvalidInputError,
    );
  });
});

describe('createLazySecretStore', () => {
  it('does not create the store until it is used, then creates it once', async () => {
    const create = vi.fn(() => createMemorySecretStore());
    const store = createLazySecretStore(create);

    expect(create).not.toHaveBeenCalled();

    await store.put('a/b', new Uint8Array([1]));
    await store.get('a/b');
    await store.list('');
    await store.delete('a/b');

    expect(create).toHaveBeenCalledOnce();
  });

  it('passes calls through to the real store', async () => {
    const store = createLazySecretStore(() => createMemorySecretStore());

    await store.put('github/x/key', new Uint8Array([7, 8]));

    expect(await store.get('github/x/key')).toEqual(new Uint8Array([7, 8]));
    expect(await store.list('github/')).toEqual(['github/x/key']);
    await store.delete('github/x/key');
    expect(await store.get('github/x/key')).toBeNull();
  });

  it('surfaces the factory error at the first call, not at creation', async () => {
    const store = createLazySecretStore(() => {
      throw new Error('windows only');
    });

    await expect(Promise.resolve().then(() => store.get('a'))).rejects.toThrow(
      'windows only',
    );
  });
});

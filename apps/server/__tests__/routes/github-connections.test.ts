/**
 * GitHub connections API: add an App by id and key, list connections.
 *
 * Why: the App's private key can mint installation tokens that push to and merge in a
 *   company's repositories. It must land in the secret store under its namespaced name and
 *   nowhere else: not in the database row, not in any response, not in the error of a
 *   refused request. A key that is not a PEM, or an App id that is not a number, must be
 *   refused before anything is stored, and a failed save must not leave an orphan secret.
 *
 * Pins: 201 returns the connection without key material; the key is in the SecretStore at
 *   `github/<id>/key`; ids are slugs of the account and never collide; listing is oldest
 *   first and has no key; bad bodies are 400 and store nothing; a database failure after the
 *   key was stored removes the key again.
 * Depends on: helpers/http-rig, helpers/route-extras, src/routes. IO: in-memory storage and secrets.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { StorageAdapter } from '@forge/core';
import type { Engine } from '@forge/engine';
import { createMemorySecretStore } from '@forge/secrets';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';

const PEM =
  '-----BEGIN RSA PRIVATE KEY-----\nTOPSECRETBYTES\n-----END RSA PRIVATE KEY-----\n';

const GOOD = { account: 'Acme Inc', app_id: '12345', private_key_pem: PEM };

let rig: HttpRig;
let storage: StorageAdapter;
let secrets: ReturnType<typeof createMemorySecretStore>;

async function start(over: { storage?: StorageAdapter } = {}) {
  storage = over.storage ?? createMemoryStorage();
  secrets = createMemorySecretStore();
  rig = await startHttp(
    buildRoutes({
      engine: { liveRunIds: vi.fn(() => []) } as unknown as Engine,
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      ...stubHarnessDeps(),
      secrets,
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now: () => Date.parse('2026-10-14T08:00:00.000Z'),
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );
}

beforeEach(() => start());

afterEach(async () => {
  await rig.close();
});

describe('POST /github/connections', () => {
  it('stores the key in the secret store and answers with the connection only', async () => {
    const res = await rig.json('POST', '/github/connections', {
      ...GOOD,
      app_slug: 'forge-acme',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      connection: {
        id: 'acme-inc',
        account: 'Acme Inc',
        app_id: '12345',
        app_slug: 'forge-acme',
        key_secret_name: 'github/acme-inc/key',
        status: 'active',
        created_at: '2026-10-14T08:00:00.000Z',
      },
    });

    expect(JSON.stringify(res.body)).not.toContain('TOPSECRET');
    expect(
      new TextDecoder().decode((await secrets.get('github/acme-inc/key')) ?? undefined),
    ).toBe(PEM);

    expect(
      JSON.stringify(await storage.transaction((tx) => tx.githubConnections.list())),
    ).not.toContain('TOPSECRET');
  });

  it('gives a second connection for the same account its own id and key', async () => {
    await rig.json('POST', '/github/connections', GOOD);
    const again = await rig.json('POST', '/github/connections', {
      ...GOOD,
      app_id: '777',
    });

    expect(again.body).toMatchObject({
      connection: { id: 'acme-inc-2', key_secret_name: 'github/acme-inc-2/key' },
    });

    expect(await secrets.list('github/')).toEqual([
      'github/acme-inc-2/key',
      'github/acme-inc/key',
    ]);
  });

  it('makes a valid id out of an account name with odd characters', async () => {
    const res = await rig.json('POST', '/github/connections', {
      ...GOOD,
      account: '  --Ünïcode & Co.!  ',
    });

    expect(res.status).toBe(201);
    expect((res.body as { connection: { id: string } }).connection.id).toMatch(
      /^[a-z0-9][a-z0-9-]*$/,
    );
  });

  it.each([
    ['a body that is not a PEM key', { private_key_pem: 'hunter2' }],
    ['a non-numeric app id', { app_id: 'abc' }],
    ['a missing account', { account: undefined }],
    ['an unknown key', { extra: 1 }],
  ])('refuses %s and stores nothing', async (_name, over) => {
    const res = await rig.json('POST', '/github/connections', { ...GOOD, ...over });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('TOPSECRET');
    expect(await secrets.list('')).toEqual([]);
    expect(await storage.transaction((tx) => tx.githubConnections.list())).toEqual([]);
  });

  it('removes the stored key again when the row cannot be saved', async () => {
    await rig.close();
    const real = createMemoryStorage();
    await start({
      storage: {
        close: () => real.close(),
        transaction: (fn) =>
          real.transaction((tx) =>
            fn({
              ...tx,
              githubConnections: {
                ...tx.githubConnections,
                upsert: async () => {
                  throw new Error('disk full');
                },
              },
            }),
          ),
      },
    });

    const res = await rig.json('POST', '/github/connections', GOOD);

    expect(res.status).toBe(500);
    expect(await secrets.list('')).toEqual([]);
  });
});

describe('GET /github/connections', () => {
  it('lists connections oldest first without any key material', async () => {
    await rig.json('POST', '/github/connections', GOOD);
    await rig.json('POST', '/github/connections', { ...GOOD, account: 'Other Org' });

    const res = await rig.json('GET', '/github/connections');

    expect(res.status).toBe(200);
    expect(
      (res.body as { connections: { id: string }[] }).connections.map((c) => c.id),
    ).toEqual(['acme-inc', 'other-org']);

    expect(JSON.stringify(res.body)).not.toMatch(/TOPSECRET|private_key/);
  });

  it('is empty on a fresh install', async () => {
    expect((await rig.json('GET', '/github/connections')).body).toEqual({
      connections: [],
    });
  });
});

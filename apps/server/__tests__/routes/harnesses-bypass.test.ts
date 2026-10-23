/**
 * The "Bypass permissions" field of the harness API.
 *
 * Why: whether Workers run without asking is the owner's choice per harness (d-0183). If a save lost
 *   the switch, or a credential save rebuilt the row without it, a Worker would silently go back to
 *   asking, or the owner's "off" would turn itself on. The list also has to say what a run will
 *   actually use, since a never-set switch reads as on.
 *
 * Pins: GET /harnesses lists the effective value beside the stored one, PUT saves false, a
 *   credential save and a later save that omits the field keep it, and a non-boolean is refused.
 * Depends on: src/routes/routes, helpers/http-rig, @forge/db and @forge/secrets (memory
 *   adapters). IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import { createMemorySecretStore } from '@forge/secrets';
import type { SecretStore, StorageAdapter } from '@forge/core';
import type { HarnessSetup, HarnessTestResult } from '@forge/drivers';
import type { Engine } from '@forge/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';

const KEY = 'sk-ant-api03-ROUTE-TEST-SECRET';

let rig: HttpRig;
let storage: StorageAdapter;
let secrets: SecretStore;
let tests: { setup: HarnessSetup; live: boolean }[];
let answer: HarnessTestResult;

beforeEach(async () => {
  storage = createMemoryStorage();
  secrets = createMemorySecretStore();
  tests = [];
  answer = {
    binary_path: 'C:/bin/claude.exe',
    version: '2.1.299',
    auth_mode: 'login',
    ok: true,
    account_kind: 'account',
    live: 'skipped',
  };

  rig = await startHttp(
    buildRoutes({
      engine: { liveRunIds: vi.fn(() => []) } as unknown as Engine,
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      hooks: { handle: vi.fn() },
      secrets,
      harnessTest: async (setup, live) => {
        tests.push({ setup, live });

        return answer;
      },
      owner: 'srv-test',
      startedAt: 0,
      now: () => Date.UTC(2026, 9, 14, 10, 0, 0),
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );
});

afterEach(async () => {
  await rig.close();
});

const register = (
  body: Record<string, unknown> = { kind: 'claude', auth_mode: 'login' },
) => rig.json('PUT', '/harnesses/claude', body);

describe('bypass_permissions on /harnesses', () => {
  it('lists the effective value as on while the stored value stays unset', async () => {
    await register();

    const { body } = (await rig.json('GET', '/harnesses')) as {
      body: { harnesses: Record<string, unknown>[] };
    };

    expect(body.harnesses[0]).not.toHaveProperty('bypass_permissions');
    expect(body.harnesses[0]).toMatchObject({ bypass_permissions_effective: true });
  });

  it('saves false, returns it with effective false, and keeps it through a credential save', async () => {
    const saved = await register({
      kind: 'claude',
      auth_mode: 'login',
      bypass_permissions: false,
    });

    expect(saved.body).toMatchObject({
      bypass_permissions: false,
      bypass_permissions_effective: false,
    });

    await rig.json('PUT', '/harnesses/claude/secret', { kind: 'api_key', value: KEY });
    const row = await storage.transaction((tx) => tx.harnesses.get('claude'));

    expect(row?.bypass_permissions).toBe(false);
  });

  it('keeps the stored switch when a later save omits it, and refuses a non-boolean', async () => {
    await register({ kind: 'claude', auth_mode: 'login', bypass_permissions: false });
    await register({ kind: 'claude', auth_mode: 'api_key' });

    expect(
      (await storage.transaction((tx) => tx.harnesses.get('claude')))?.bypass_permissions,
    ).toBe(false);

    const bad = await register({
      kind: 'claude',
      auth_mode: 'login',
      bypass_permissions: 'yes',
    });

    expect(bad.status).toBe(400);
  });
});

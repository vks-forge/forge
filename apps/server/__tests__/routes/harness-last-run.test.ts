/**
 * What the harness list says about a harness that is clearly working.
 *
 * Why: the owner read "Not tested yet" next to a harness that had run 52 Worker runs, because
 *   saving a setting that changed nothing, or storing a credential, wiped the stored test result,
 *   and only the Test button ever filled it again. The result now survives a save that changes
 *   nothing about how the harness runs, and each row says what its newest ended run did, so
 *   "worked" never depends on a button.
 *
 * Pins: a save of the same binary and sign-in keeps status, version and time; storing a credential
 *   keeps them; a changed sign-in clears them; the row carries `last_run` from the newest ended run
 *   of that harness (a run still going is skipped) and none when it never ran.
 * Depends on: src/routes/routes, helpers/http-rig, helpers/read-rig, @forge/db and @forge/secrets (memory adapters). IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import { createMemorySecretStore } from '@forge/secrets';
import type { StorageAdapter } from '@forge/core';
import type { Engine } from '@forge/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import { makeRun } from '#tests/helpers/read-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';

let rig: HttpRig;
let storage: StorageAdapter;

beforeEach(async () => {
  storage = createMemoryStorage();
  rig = await startHttp(
    buildRoutes({
      engine: { liveRunIds: vi.fn(() => []) } as unknown as Engine,
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      hooks: { handle: vi.fn() },
      secrets: createMemorySecretStore(),
      harnessTest: async () => ({
        binary_path: 'C:/bin/claude.exe',
        version: '2.1.299',
        auth_mode: 'login',
        ok: true,
        account_kind: 'account',
        live: 'skipped',
      }),
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

const put = (body: Record<string, unknown>) => rig.json('PUT', '/harnesses/claude', body);
const list = async () =>
  ((await rig.json('GET', '/harnesses')).body as { harnesses: Record<string, unknown>[] })
    .harnesses[0];

describe('the last check survives a save that changes nothing', () => {
  it('keeps status, version and time when the same binary and sign-in are saved again', async () => {
    await put({ kind: 'claude', auth_mode: 'login' });
    await rig.json('POST', '/harnesses/claude/test');

    const saved = await put({
      kind: 'claude',
      auth_mode: 'login',
      bypass_permissions: false,
    });

    expect(saved.body).toMatchObject({
      status: 'ok',
      version: '2.1.299',
      last_checked_at: '2026-10-14T10:00:00.000Z',
    });
  });

  it('keeps it when a credential is stored, and clears it when the sign-in changes', async () => {
    await put({ kind: 'claude', auth_mode: 'api_key' });
    await rig.json('POST', '/harnesses/claude/test');
    await rig.json('PUT', '/harnesses/claude/secret', {
      kind: 'api_key',
      value: 'sk-ant-x',
    });

    expect(await list()).toMatchObject({ status: 'ok', version: '2.1.299' });

    await put({ kind: 'claude', auth_mode: 'oauth_token' });
    const row = await list();
    expect(row).toMatchObject({ status: 'unknown' });
    expect(row).not.toHaveProperty('version');
  });
});

describe('last_run', () => {
  it('comes from the newest ended run of the harness, skipping one still going', async () => {
    await put({ kind: 'claude', auth_mode: 'login' });
    await storage.transaction(async (tx) => {
      await tx.runs.insert(
        makeRun('run-1', 'FX-1', {
          harness: 'claude',
          driver_version: '2.1.304',
          started_at: '2026-10-14T07:00:00.000Z',
          ended_at: '2026-10-14T07:12:00.000Z',
          status: 'success',
        }),
      );

      await tx.runs.insert(
        makeRun('run-2', 'FX-1', {
          harness: 'claude',
          started_at: '2026-10-14T09:00:00.000Z',
          status: 'running',
        }),
      );
    });

    expect(await list()).toMatchObject({
      last_run: { at: '2026-10-14T07:12:00.000Z', status: 'success', version: '2.1.304' },
    });
  });

  it('is absent when the harness never ran', async () => {
    await put({ kind: 'claude', auth_mode: 'login' });

    expect(await list()).not.toHaveProperty('last_run');
  });
});

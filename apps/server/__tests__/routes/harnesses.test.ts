/**
 * The harness API: register the installed `claude`, choose its login, store a credential, test it.
 *
 * Why: the owner trusts Workers with real work only after the harness is configured and
 *   checked from Settings (d-0087). These tests pin what that page relies on: a credential
 *   goes into the SecretStore and is never returned, in any response, whatever the route; the
 *   list says only whether one is stored; changing a setting clears the old test result;
 *   the test makes no paid call unless `?live=1` says so and then records version and status;
 *   and malformed bodies, bad ids and unknown harnesses are refused with a reason.
 *
 * Pins: GET /harnesses, PUT /harnesses/:id, PUT /harnesses/:id/secret, POST /harnesses/:id/test.
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

describe('GET /harnesses', () => {
  it('is empty until the owner registers one', async () => {
    expect(await rig.json('GET', '/harnesses')).toMatchObject({
      status: 200,
      body: { harnesses: [] },
    });
  });
});

describe('quota pauses on GET /harnesses', () => {
  const pause = (id: string, until: string) =>
    storage.transaction((tx) =>
      tx.harnessState.upsert({
        harness_id: id,
        paused_until: until,
        reason: 'Out of quota; resets at 14:20 UTC.',
        updated_at: '2026-10-14T09:00:00.000Z',
      }),
    );

  it('shows the pause on the harness and lists every active pause', async () => {
    await register();
    await pause('claude', '2026-10-14T14:20:00.000Z');
    await pause('other', '2026-10-14T15:00:00.000Z');

    const { body } = await rig.json('GET', '/harnesses');

    expect(body).toMatchObject({
      harnesses: [
        {
          id: 'claude',
          paused_until: '2026-10-14T14:20:00.000Z',
          pause_reason: 'Out of quota; resets at 14:20 UTC.',
        },
      ],
      paused: [{ harness_id: 'claude' }, { harness_id: 'other' }],
    });
  });

  it('shows no pause once its time has passed', async () => {
    await register();
    await pause('claude', '2026-10-14T09:59:59.000Z');

    const { body } = (await rig.json('GET', '/harnesses')) as {
      body: { harnesses: Record<string, unknown>[]; paused: unknown[] };
    };

    expect(body.paused).toEqual([]);
    expect(body.harnesses[0]).not.toHaveProperty('paused_until');
  });
});

describe('PUT /harnesses/:id', () => {
  it('saves the executable path and auth mode and lists it with no stored secrets', async () => {
    const res = await register({
      kind: 'claude',
      binary_path: 'C:/Users/me/.local/bin/claude.exe',
      auth_mode: 'api_key',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'claude',
      kind: 'claude',
      binary_path: 'C:/Users/me/.local/bin/claude.exe',
      auth_mode: 'api_key',
      status: 'unknown',
      secrets: { api_key: false, oauth_token: false },
    });

    expect((await rig.json('GET', '/harnesses')).body).toMatchObject({
      harnesses: [{ id: 'claude', auth_mode: 'api_key' }],
    });
  });

  it('refuses unknown fields, an unknown auth mode and a path-like id', async () => {
    expect((await register({ kind: 'claude', auth_mode: 'password' })).status).toBe(400);
    expect(
      (await register({ kind: 'claude', auth_mode: 'login', extra: true })).status,
    ).toBe(400);

    expect(
      (await rig.json('PUT', '/harnesses/Bad_Id', { kind: 'claude', auth_mode: 'login' }))
        .status,
    ).toBe(400);
  });
});

describe('PUT /harnesses/:id/secret', () => {
  it('stores the credential under its namespaced name and never echoes it', async () => {
    await register({ kind: 'claude', auth_mode: 'api_key' });
    const res = await rig.json('PUT', '/harnesses/claude/secret', {
      kind: 'api_key',
      value: KEY,
    });

    expect(res).toMatchObject({
      status: 200,
      body: { id: 'claude', kind: 'api_key', stored: true },
    });

    expect(new TextDecoder().decode((await secrets.get('harness/claude/api-key'))!)).toBe(
      KEY,
    );

    const list = await rig.json('GET', '/harnesses');
    expect(list.body).toMatchObject({
      harnesses: [{ secrets: { api_key: true, oauth_token: false } }],
    });

    expect(JSON.stringify([res.body, list.body])).not.toContain(KEY);
  });

  it('stores an OAuth token under its own name', async () => {
    await register({ kind: 'claude', auth_mode: 'oauth_token' });
    await rig.json('PUT', '/harnesses/claude/secret', {
      kind: 'oauth_token',
      value: 'tok-1',
    });

    expect(await secrets.list('harness/claude/')).toEqual(['harness/claude/oauth-token']);
  });

  it('refuses an unregistered harness, an empty or multi-word value and an unknown kind', async () => {
    const put = (body: unknown) => rig.json('PUT', '/harnesses/claude/secret', body);

    expect((await put({ kind: 'api_key', value: KEY })).status).toBe(404);
    await register();
    expect((await put({ kind: 'api_key', value: '' })).status).toBe(400);
    expect((await put({ kind: 'api_key', value: 'two words' })).status).toBe(400);
    expect((await put({ kind: 'password', value: KEY })).status).toBe(400);
    expect(await secrets.list('')).toEqual([]);
  });

  it('does not put the value in an error body either', async () => {
    await register();
    const res = await rig.json('PUT', '/harnesses/claude/secret', {
      kind: 'api_key',
      value: `${KEY} with spaces`,
    });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });
});

describe('POST /harnesses/:id/test', () => {
  it('skips the paid call by default, says so, and records version and status', async () => {
    await register({
      kind: 'claude',
      binary_path: 'C:/bin/claude.exe',
      auth_mode: 'login',
    });

    const res = await rig.json('POST', '/harnesses/claude/test');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      binary_path: 'C:/bin/claude.exe',
      version: '2.1.299',
      auth_mode: 'login',
      ok: true,
      account_kind: 'account',
      live: 'skipped',
      live_note: expect.stringContaining('?live=1'),
    });

    expect(tests).toEqual([
      {
        setup: { id: 'claude', binaryPath: 'C:/bin/claude.exe', authMode: 'login' },
        live: false,
      },
    ]);

    expect((await rig.json('GET', '/harnesses')).body).toMatchObject({
      harnesses: [
        {
          version: '2.1.299',
          status: 'ok',
          last_checked_at: '2026-10-14T10:00:00.000Z',
        },
      ],
    });
  });

  it('asks for the live call only with ?live=1', async () => {
    await register();
    answer = { ...answer, live: 'ok' };
    const res = await rig.json('POST', '/harnesses/claude/test?live=1');

    expect(tests.map((t) => t.live)).toEqual([true]);
    expect(res.body).toMatchObject({ live: 'ok' });
    expect(res.body).not.toHaveProperty('live_note');
  });

  it('records a failed test as status error and returns the reason', async () => {
    await register();
    answer = { auth_mode: 'login', ok: false, live: 'skipped', error: 'not installed' };
    const res = await rig.json('POST', '/harnesses/claude/test');

    expect(res.body).toMatchObject({ ok: false, error: 'not installed' });
    expect((await rig.json('GET', '/harnesses')).body).toMatchObject({
      harnesses: [{ status: 'error' }],
    });
  });

  it('a settings change clears the old result', async () => {
    await register();
    await rig.json('POST', '/harnesses/claude/test');
    const res = await register({ kind: 'claude', auth_mode: 'oauth_token' });

    expect(res.body).toMatchObject({ status: 'unknown' });
    expect(res.body).not.toHaveProperty('version');
  });

  it('is 404 for an unregistered harness', async () => {
    expect((await rig.json('POST', '/harnesses/claude/test')).status).toBe(404);
    expect(tests).toEqual([]);
  });
});

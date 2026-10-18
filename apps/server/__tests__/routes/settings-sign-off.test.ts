/**
 * The Director's sign-off ceiling through the settings API.
 *
 * Why: how far the Director may sign finished work itself is the one trust setting a project may only
 *   lower. The server is where that is enforced: tier C is not a value (a person always signs it), the
 *   company sets the most trust it will give, a project value above it is refused with the reason, and a
 *   value stored before the company lowered the ceiling is held to the company's, never above it.
 *
 * Pins: the default is tier B and the company can lower it; `C` is a 400 `invalid_request` and stores
 *   nothing; a project may equal or lower the ceiling and is refused above it; a stored project value
 *   above a later, lower company value reads as the company's.
 * Depends on: src/routes/routes, helpers/http-rig, @forge/db (memory adapters). IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { ConfigSource, StorageAdapter } from '@forge/core';
import type { Engine } from '@forge/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';

let rig: HttpRig;
let storage: StorageAdapter;
let config: ConfigSource;

const WHO = { author: 'owner', reason: 'tuning' };

beforeEach(async () => {
  storage = createMemoryStorage();
  config = createMemoryConfigSource();
  await storage.transaction((tx) =>
    tx.projects.upsert({
      id: 'demo',
      slug: 'demo',
      prefix: 'DM',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    }),
  );

  rig = await startHttp(
    buildRoutes({
      ...stubHarnessDeps(),
      engine: { liveRunIds: vi.fn(() => []) } as unknown as Engine,
      storage,
      config,
      ...inertRouteExtras(),
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now: () => 5_000,
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );
});

afterEach(async () => {
  await rig.close();
});

describe('the Director sign-off ceiling', () => {
  const company = (max_tier: string, expectedVersion = 0) =>
    rig.json('PUT', '/settings/company', {
      doc: { director: { sign_off: { max_tier } } },
      expectedVersion,
      ...WHO,
    });

  const project = (max_tier: string, expectedVersion = 0) =>
    rig.json('PUT', '/settings/projects/demo', {
      doc: { director: { sign_off: { max_tier } } },
      expectedVersion,
      ...WHO,
    });

  it('defaults to tier B and lets the company lower it', async () => {
    expect((await rig.json('GET', '/settings/company')).body).toMatchObject({
      config: { director: { sign_off: { max_tier: 'B' } } },
    });

    expect((await company('A')).status).toBe(200);
    expect((await rig.json('GET', '/settings/company')).body).toMatchObject({
      config: { director: { sign_off: { max_tier: 'A' } } },
    });
  });

  it('refuses tier C, which is not a value: tier C always needs a person', async () => {
    const res = await company('C');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
    expect((await config.company()).version).toBe(0);
  });

  it('lets a project lower the ceiling and refuses one above the company value', async () => {
    await company('A');
    const above = await project('B');

    expect(above.status).toBe(400);
    expect(above.body).toMatchObject({
      error: { code: 'invalid_request', message: expect.stringContaining('only lower') },
    });

    expect((await config.project('demo')).version.project).toBe(0);
    expect((await project('none')).status).toBe(200);
    expect((await rig.json('GET', '/settings/projects/demo')).body).toMatchObject({
      config: { forge: { director: { sign_off: { max_tier: 'none' } } } },
    });
  });

  it('holds a stored project value above a later, lower company value to the company value', async () => {
    await project('B');
    await company('A');

    expect((await rig.json('GET', '/settings/projects/demo')).body).toMatchObject({
      config: { forge: { director: { sign_off: { max_tier: 'A' } } } },
    });
  });
});

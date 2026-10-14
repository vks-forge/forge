/**
 * The settings API against an in-memory ConfigSource.
 *
 * Why: settings are the one thing the owner edits to steer the whole factory (d-0085), and
 *   the page that edits them needs three guarantees from the server: a save that raced
 *   another save is refused with 409 and the newer version named (never a silent
 *   overwrite), a document the engine could not run on is refused with 400 and the reason,
 *   and every save is attributed (author, reason) and readable back as history. These
 *   tests pin those answers at the HTTP edge; merge rules are pinned in core.
 *
 * Pins: GET/PUT /settings/company, GET/PUT /settings/projects/:slug, the two /history
 *   routes, 400 on bad bodies and unknown keys, 404 for an unregistered project, 409 on a
 *   stale expectedVersion.
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

describe('company settings', () => {
  it('serves the built-in defaults at version 0 on a fresh install', async () => {
    const res = await rig.json('GET', '/settings/company');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: 0,
      config: { engine: { global_slots: 3 } },
    });
  });

  it('saves a change as the next version and serves the merged result', async () => {
    const put = await rig.json('PUT', '/settings/company', {
      doc: { engine: { global_slots: 5 } },
      expectedVersion: 0,
      ...WHO,
    });

    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      scope: 'company',
      version: 1,
      author: 'owner',
      reason: 'tuning',
      doc: { engine: { global_slots: 5 } },
    });

    const got = await rig.json('GET', '/settings/company');
    expect(got.body).toMatchObject({
      version: 1,
      config: { engine: { global_slots: 5, stall_ms: 300_000 } },
    });
  });

  it('refuses a stale expectedVersion with 409 and leaves the settings alone', async () => {
    await rig.json('PUT', '/settings/company', {
      doc: { engine: { global_slots: 5 } },
      expectedVersion: 0,
      ...WHO,
    });

    const res = await rig.json('PUT', '/settings/company', {
      doc: { engine: { global_slots: 7 } },
      expectedVersion: 0,
      ...WHO,
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'version_conflict' } });
    expect((await config.company()).version).toBe(1);
  });

  it('refuses a document the engine could not run on with 400', async () => {
    const res = await rig.json('PUT', '/settings/company', {
      doc: { engine: { global_slots: 'many' } },
      expectedVersion: 0,
      ...WHO,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
    expect((await config.company()).version).toBe(0);
  });

  it('refuses unknown keys, a missing reason and extra body fields', async () => {
    const unknownKey = await rig.json('PUT', '/settings/company', {
      doc: { engin: {} },
      expectedVersion: 0,
      ...WHO,
    });

    const noReason = await rig.json('PUT', '/settings/company', {
      doc: {},
      expectedVersion: 0,
      author: 'owner',
    });

    const extra = await rig.json('PUT', '/settings/company', {
      doc: {},
      expectedVersion: 0,
      ...WHO,
      scope: 'project',
    });

    expect([unknownKey.status, noReason.status, extra.status]).toEqual([400, 400, 400]);
  });

  it('lists every saved version, oldest first', async () => {
    await rig.json('PUT', '/settings/company', {
      doc: { engine: { global_slots: 4 } },
      expectedVersion: 0,
      ...WHO,
    });

    await rig.json('PUT', '/settings/company', {
      doc: { engine: { global_slots: 2 } },
      expectedVersion: 1,
      author: 'owner',
      reason: 'back off',
    });

    const res = await rig.json('GET', '/settings/company/history');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      versions: [
        { version: 1, reason: 'tuning' },
        { version: 2, reason: 'back off' },
      ],
    });
  });
});

describe('project settings', () => {
  it('serves defaults with the company and project versions', async () => {
    const res = await rig.json('GET', '/settings/projects/demo');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: { company: 0, project: 0 },
      config: { project: { profile: 'generic' }, forge: { engine: { global_slots: 3 } } },
    });
  });

  it('saves a project override that wins over the defaults', async () => {
    const put = await rig.json('PUT', '/settings/projects/demo', {
      doc: { profile: 'ts', commands: { test: 'pnpm test' } },
      expectedVersion: 0,
      ...WHO,
    });

    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ scope: 'project', project: 'demo', version: 1 });

    const got = await rig.json('GET', '/settings/projects/demo');
    expect(got.body).toMatchObject({
      version: { project: 1 },
      config: { project: { profile: 'ts', commands: { test: 'pnpm test' } } },
    });
  });

  it('refuses a project trying to set its own slug and a stale version', async () => {
    const identity = await rig.json('PUT', '/settings/projects/demo', {
      doc: { slug: 'other' },
      expectedVersion: 0,
      ...WHO,
    });

    await rig.json('PUT', '/settings/projects/demo', {
      doc: { profile: 'ts' },
      expectedVersion: 0,
      ...WHO,
    });

    const stale = await rig.json('PUT', '/settings/projects/demo', {
      doc: { profile: 'generic' },
      expectedVersion: 0,
      ...WHO,
    });

    expect(identity.status).toBe(400);
    expect(stale.status).toBe(409);
  });

  it('answers 404 for a project that is not registered', async () => {
    const get = await rig.json('GET', '/settings/projects/ghost');
    const put = await rig.json('PUT', '/settings/projects/ghost', {
      doc: {},
      expectedVersion: 0,
      ...WHO,
    });

    const history = await rig.json('GET', '/settings/projects/ghost/history');

    expect([get.status, put.status, history.status]).toEqual([404, 404, 404]);
  });

  it('lists the project history', async () => {
    await rig.json('PUT', '/settings/projects/demo', {
      doc: { profile: 'ts' },
      expectedVersion: 0,
      ...WHO,
    });

    const res = await rig.json('GET', '/settings/projects/demo/history');

    expect(res.body).toMatchObject({
      versions: [{ scope: 'project', project: 'demo', version: 1 }],
    });
  });
});

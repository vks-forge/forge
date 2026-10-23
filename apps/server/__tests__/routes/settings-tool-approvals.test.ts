/**
 * Saving a project's tool grants: an "always" approval the policy would refuse is never stored.
 *
 * Why: an owner-approved rule is a permanent widening of what Workers may do. If Settings stored a
 * wildcard shell rule, an interpreter, or an allow over a protected path, the policy would refuse
 * it at run time (fail closed) and the owner would believe a rule existed that does nothing, or
 * worse, depend on one that is too wide. So the save is refused with the reason, and nothing is
 * written, while a narrow exact rule saves like any setting and can be revoked by saving without it.
 *
 * Pins: PUT /settings/projects/:slug with `tool_grants.approved`: an exact rule saves and reads
 *   back; a wildcard shell rule, a banned interpreter, a path rule over a protected path and a
 *   non-allow rule are 400 `invalid_request` with the reason and no new version; a save without
 *   the rule revokes it as a new version.
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

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'approved-int-1',
  action: 'shell',
  resource: 'pkg add left-pad',
  effect: 'allow',
  created_at: '2026-10-20T10:00:00.000Z',
  source: { ticket_id: 'DM-1', interaction_id: 'int-1' },
  ...over,
});

const put = (approved: unknown[], expectedVersion = 0) =>
  rig.json('PUT', '/settings/projects/demo', {
    doc: { tool_grants: { approved } },
    expectedVersion,
    ...WHO,
  });

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

describe('approved tool rules in project settings', () => {
  it('saves an exact rule, reads it back, and revokes it with a new version', async () => {
    expect((await put([rule()])).status).toBe(200);

    const got = await rig.json('GET', '/settings/projects/demo');
    expect(got.body).toMatchObject({
      version: { project: 1 },
      config: { project: { tool_grants: { approved: [{ id: 'approved-int-1' }] } } },
    });

    expect((await put([], 1)).status).toBe(200);
    const after = await rig.json('GET', '/settings/projects/demo');
    expect(after.body).toMatchObject({
      version: { project: 2 },
      config: { project: { tool_grants: { approved: [] } } },
    });
  });

  it.each([
    ['a wildcard shell rule', rule({ resource: 'pkg add *' })],
    ['a banned interpreter', rule({ resource: 'bash' })],
    ['an allow over a protected path', rule({ action: 'edit', resource: '.forge/**' })],
    ['a rule that is not an allow', rule({ effect: 'ask' })],
  ])('refuses %s and stores nothing', async (_name, bad) => {
    const res = await put([bad]);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('invalid_request');
    expect((await config.history('project', 'demo')).length).toBe(0);
  });
});

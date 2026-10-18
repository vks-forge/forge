/**
 * The Director's pipeline dials through the settings API.
 *
 * Why: how far the Director goes with ticket pipelines is the owner's to tune without a code edit (d-0150,
 *   code.md rule 9): whether it may adjust a ticket's own copy at all, and how often the same change must repeat
 *   (tickets, cards, days) before it proposes one for the project's lane. The server is where those dials are held
 *   to their bounds, so a value that would make every ticket a proposal (one ticket) or never expire (a year)
 *   is refused before it is stored, and a project may override any of them.
 *
 * Pins: the defaults (adjust on, 3 tickets from 2 cards in 30 days); a company save and a project override take
 *   effect in the merged view; out-of-range values and unknown keys are 400 `invalid_request` and store nothing.
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

const company = (pipelines: Record<string, unknown>, expectedVersion = 0) =>
  rig.json('PUT', '/settings/company', {
    doc: { director: { pipelines } },
    expectedVersion,
    ...WHO,
  });

const project = (pipelines: Record<string, unknown>, expectedVersion = 0) =>
  rig.json('PUT', '/settings/projects/demo', {
    doc: { director: { pipelines } },
    expectedVersion,
    ...WHO,
  });

describe('director.pipelines', () => {
  it('defaults to adjusting on, proposing after 3 tickets from 2 cards in 30 days', async () => {
    expect((await rig.json('GET', '/settings/company')).body).toMatchObject({
      config: {
        director: {
          pipelines: {
            adjust: true,
            propose_after: 3,
            propose_min_cards: 2,
            propose_window_days: 30,
          },
        },
      },
    });
  });

  it('takes a company save and a project override, merged over the defaults', async () => {
    expect((await company({ adjust: false, propose_after: 5 })).status).toBe(200);
    expect((await rig.json('GET', '/settings/company')).body).toMatchObject({
      config: {
        director: {
          pipelines: { adjust: false, propose_after: 5, propose_min_cards: 2 },
        },
      },
    });

    expect((await project({ propose_window_days: 14 })).status).toBe(200);
    const merged = (await rig.json('GET', '/settings/projects/demo')).body as {
      config?: { director?: { pipelines?: unknown } };
      effective?: { director?: { pipelines?: unknown } };
    };

    expect(JSON.stringify(merged)).toContain('"propose_window_days":14');
  });

  it.each([
    [{ propose_after: 1 }],
    [{ propose_after: 11 }],
    [{ propose_min_cards: 0 }],
    [{ propose_min_cards: 6 }],
    [{ propose_window_days: 6 }],
    [{ propose_window_days: 91 }],
    [{ adjust: 'yes' }],
    [{ propose_often: true }],
  ])('refuses %j and stores nothing', async (value) => {
    const res = await company(value);

    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('invalid_request');
    expect(await config.history('company')).toHaveLength(0);

    const own = await project(value);

    expect(own.status).toBe(400);
    expect(await config.history('project', 'demo')).toHaveLength(0);
  });
});

/**
 * The Director's memory-retrieval dials through the settings API.
 *
 * Why: how the Director reads project memory is the owner's to tune without a code edit (d-0168, code.md rule
 *   9): whether one cheap model call turns a question into key words, how long and how much that call may take,
 *   how many relevant and pinned decisions go into a prompt, and how many rejected approaches are always
 *   listed. The server is where those dials are held to their bounds, so a value that would make a prompt
 *   huge (a thousand decisions), make the rewrite cost real money (a budget of twenty dollars) or hide rejected
 *   approaches (a cap of one) is refused before it is stored, and a project may override any of them.
 *
 * Pins: the defaults (rewrite on, 15 s, $0.25, 8 relevant, 12 pinned, 25 rejected, and the `memory_rewrite`
 *   model `haiku`); a company save and a project override take effect in the merged view; out-of-range values
 *   and unknown keys are 400 `invalid_request` and store nothing.
 * Depends on: src/routes/routes, helpers/http-rig, @forge/db (memory adapters). IO: a loopback socket.
 */

import type { ConfigSource, StorageAdapter } from '@forge/core';
import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
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

const company = (memory: Record<string, unknown>, expectedVersion = 0) =>
  rig.json('PUT', '/settings/company', {
    doc: { director: { memory } },
    expectedVersion,
    ...WHO,
  });

const project = (memory: Record<string, unknown>, expectedVersion = 0) =>
  rig.json('PUT', '/settings/projects/demo', {
    doc: { director: { memory } },
    expectedVersion,
    ...WHO,
  });

describe('director.memory', () => {
  it('defaults to the d-0168 numbers and a haiku rewrite model', async () => {
    const res = (await rig.json('GET', '/settings/company')).body as {
      config: {
        director: { memory: unknown };
        models: { director: Record<string, string> };
      };
    };

    expect(res.config.director.memory).toEqual({
      rewrite: true,
      rewrite_timeout_ms: 15_000,
      rewrite_budget_usd: 0.25,
      top_k: 8,
      pinned_max: 12,
      rejected_max: 25,
    });

    expect(res.config.models.director['memory_rewrite']).toBe('haiku');
  });

  it('takes a company save and a project override, merged over the defaults', async () => {
    expect((await company({ rewrite: false, top_k: 12 })).status).toBe(200);
    expect((await rig.json('GET', '/settings/company')).body).toMatchObject({
      config: { director: { memory: { rewrite: false, top_k: 12, pinned_max: 12 } } },
    });

    expect((await project({ rejected_max: 10 })).status).toBe(200);
    const merged = JSON.stringify(
      (await rig.json('GET', '/settings/projects/demo')).body,
    );

    expect(merged).toContain('"rejected_max":10');
  });

  it.each([
    [{ rewrite_timeout_ms: 999 }],
    [{ rewrite_timeout_ms: 60_001 }],
    [{ rewrite_budget_usd: -0.01 }],
    [{ rewrite_budget_usd: 20 }],
    [{ top_k: 0 }],
    [{ top_k: 1000 }],
    [{ pinned_max: 26 }],
    [{ pinned_max: -1 }],
    [{ rejected_max: 1 }],
    [{ rejected_max: 51 }],
    [{ rewrite: 'yes' }],
    [{ top_n: 3 }],
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

/**
 * `/harnesses/:id/compat`, `/harnesses/:id/tools` and `/settings/catalogue`.
 *
 * Why: these are the owner's controls for the two things a new Claude Code build can break:
 * whether it may run at all (the compatibility check) and which of its built-in tools Workers
 * may use (approvals), plus the tool catalogue itself. The UI is only a skin over them, so the
 * shapes and the refusals are pinned here: an unknown harness or tool is 404, a decision
 * needs an author and a reason, a stale catalogue save is 409 and nothing is overwritten, and
 * a catalogue that would leave no usable tools is 400.
 *
 * Pins: GET compat before and after a check, POST compat/run returns 202 with the job,
 *   GET tools lists the build rows, approve/deny validate and record, catalogue GET/PUT/history
 *   with CAS and validation.
 * Depends on: src/routes/routes, src/services/harness-compat, helpers/http-rig, @forge/db
 *   memory stores. IO: a loopback HTTP server.
 */

import {
  createMemoryCatalogueStore,
  createMemoryConfigSource,
  createMemoryStorage,
} from '@forge/db';
import type { CompatReport, StorageAdapter } from '@forge/core';
import type { Engine } from '@forge/engine';
import { createMemorySecretStore } from '@forge/secrets';
import { BUILT_IN_CATALOGUE } from '@forge/tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { createHarnessCompat } from '#/services/harness-compat.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';

const hash = (c: string) => `sha256:${c.repeat(64)}`;
const report: CompatReport = {
  kind: 'claude',
  version: '9.9.9',
  started_at: '2026-10-14T10:00:00.000Z',
  finished_at: '2026-10-14T10:01:00.000Z',
  passed: true,
  summary: 'Build 9.9.9 passed all compatibility checks.',
  checks: [{ id: 'tool_schemas', status: 'pass', detail: '24 tools' }],
  tools: [{ tool: 'read', native: ['Read'], schema_hash: hash('a') }],
};

const WHO = { author: 'owner', reason: 'reviewed' };

let rig: HttpRig;
let storage: StorageAdapter;
let compat: HarnessCompat;

beforeEach(async () => {
  storage = createMemoryStorage();
  const catalogue = createMemoryCatalogueStore();
  compat = createHarnessCompat({
    storage,
    catalogue,
    port: {
      engine: 'acp',
      installedVersion: async () => '9.9.9',
      check: async () => report,
    },
    supportKey: 'claude-code',
    now: () => Date.UTC(2026, 9, 14, 12, 0, 0),
    log: () => undefined,
  });

  await storage.transaction((tx) =>
    tx.harnesses.upsert({
      id: 'claude',
      kind: 'claude',
      auth_mode: 'login',
      status: 'unknown',
    }),
  );

  rig = await startHttp(
    buildRoutes({
      engine: { liveRunIds: vi.fn(() => []) } as unknown as Engine,
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      catalogue,
      compat,
      hooks: { handle: vi.fn() },
      secrets: createMemorySecretStore(),
      harnessTest: async (setup) => ({
        auth_mode: setup.authMode,
        ok: true,
        live: 'skipped',
      }),
      owner: 'srv-test',
      startedAt: 0,
      now: () => 0,
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );
});

afterEach(async () => {
  await compat.idle();
  await rig.close();
});

describe('GET /harnesses/:id/compat', () => {
  it('is unknown before any build was seen and 404 for an unregistered harness', async () => {
    expect(await rig.json('GET', '/harnesses/claude/compat')).toMatchObject({
      status: 200,
      body: { version: null, compat: 'unknown', report: null, job: { state: 'idle' } },
    });

    expect((await rig.json('GET', '/harnesses/nope/compat')).status).toBe(404);
  });

  it('answers the latest report of the installed build once the check ran', async () => {
    expect((await rig.json('POST', '/harnesses/claude/compat/run')).status).toBe(202);
    await compat.idle();

    expect(await rig.json('GET', '/harnesses/claude/compat')).toMatchObject({
      body: {
        version: '9.9.9',
        compat: 'pass',
        report: { passed: true, summary: report.summary },
        job: { state: 'done' },
      },
    });
  });
});

describe('POST /harnesses/:id/compat/run', () => {
  it('starts a check and returns the job state, and is 404 for an unregistered harness', async () => {
    const res = await rig.json('POST', '/harnesses/claude/compat/run');

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ state: expect.stringMatching(/running|done/) });
    expect((await rig.json('POST', '/harnesses/nope/compat/run')).status).toBe(404);
  });
});

describe('tool approvals', () => {
  beforeEach(async () => {
    await rig.json('POST', '/harnesses/claude/compat/run');
    await compat.idle();
  });

  it('lists the tools of the installed build with their status', async () => {
    expect(await rig.json('GET', '/harnesses/claude/tools')).toMatchObject({
      status: 200,
      body: {
        version: '9.9.9',
        tools: [{ tool: 'read', status: 'pending', schema_hash: hash('a') }],
      },
    });
  });

  it('approves with an author and a reason', async () => {
    const res = await rig.json('POST', '/harnesses/claude/tools/read/approve', WHO);

    expect(res).toMatchObject({
      status: 200,
      body: {
        tool: 'read',
        status: 'approved',
        decided_by: 'owner',
        decision_reason: 'reviewed',
      },
    });
  });

  it('denies, and a later approval replaces the denial', async () => {
    await rig.json('POST', '/harnesses/claude/tools/read/deny', WHO);
    const after = await rig.json('GET', '/harnesses/claude/tools');

    expect(after.body).toMatchObject({ tools: [{ status: 'denied' }] });
    expect(
      (await rig.json('POST', '/harnesses/claude/tools/read/approve', WHO)).body,
    ).toMatchObject({ status: 'approved' });
  });

  it('refuses a decision without an author or reason, an unknown tool and an unknown harness', async () => {
    const path = '/harnesses/claude/tools/read/approve';

    expect((await rig.json('POST', path, { author: 'owner' })).status).toBe(400);
    expect((await rig.json('POST', path, { ...WHO, extra: 1 })).status).toBe(400);
    expect(
      (await rig.json('POST', '/harnesses/claude/tools/nope/approve', WHO)).status,
    ).toBe(404);

    expect(
      (await rig.json('POST', '/harnesses/nope/tools/read/approve', WHO)).status,
    ).toBe(404);
  });
});

describe('/settings/catalogue', () => {
  const doc = (drop?: string) => ({
    entries: BUILT_IN_CATALOGUE.entries.filter((e) => e.id !== drop),
  });

  it('serves the built-in catalogue as version 1', async () => {
    const res = await rig.json('GET', '/settings/catalogue');

    expect(res).toMatchObject({ status: 200, body: { version: 1, author: 'forge' } });
    expect((res.body as { doc: { entries: unknown[] } }).doc.entries).toHaveLength(
      BUILT_IN_CATALOGUE.entries.length,
    );
  });

  it('saves a new version, keeps the history and refuses a stale save with 409', async () => {
    const saved = await rig.json('PUT', '/settings/catalogue', {
      doc: doc('mcp__forge__web_fetch'),
      ...WHO,
      expectedVersion: 1,
    });

    const stale = await rig.json('PUT', '/settings/catalogue', {
      doc: doc('mcp__forge__web_search'),
      ...WHO,
      expectedVersion: 1,
    });

    const history = await rig.json('GET', '/settings/catalogue/history');

    expect(saved).toMatchObject({ status: 200, body: { version: 2, author: 'owner' } });
    expect(stale.status).toBe(409);
    expect((history.body as { versions: unknown[] }).versions).toHaveLength(2);
  });

  it('refuses a document that is not a usable catalogue and a body without author or reason', async () => {
    const dup = {
      entries: [...BUILT_IN_CATALOGUE.entries, BUILT_IN_CATALOGUE.entries[0]],
    };

    expect(
      (
        await rig.json('PUT', '/settings/catalogue', {
          doc: { entries: [] },
          ...WHO,
          expectedVersion: 1,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await rig.json('PUT', '/settings/catalogue', {
          doc: dup,
          ...WHO,
          expectedVersion: 1,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await rig.json('PUT', '/settings/catalogue', {
          doc: doc(),
          author: 'o',
          expectedVersion: 1,
        })
      ).status,
    ).toBe(400);

    expect((await rig.json('GET', '/settings/catalogue')).body).toMatchObject({
      version: 1,
    });
  });
});

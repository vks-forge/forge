/**
 * The HTTP routes against a fake engine and real in-memory storage.
 *
 * Why: the routes are thin, but each one is a trust boundary: intake parses untrusted JSON,
 *   the ticket view joins four tables, the answer route turns a compare-and-swap loss into
 *   409, the hook route turns a bearer header into a token, and health must report a broken
 *   database as 503. The engine is a fake here so each test pins exactly what the route
 *   sends it and returns; the real engine runs in the end-to-end tests.
 *
 * Pins: status codes and bodies of /intake, /tickets/:id, /interactions/:id/answer,
 *   /runs/:id/hook, /runs/:id/events (errors only) and /health.
 * Depends on: src/routes/routes, helpers/http-rig, @forge/db (memory storage). IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { StorageAdapter, Ticket } from '@forge/core';
import type { Engine } from '@forge/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOOK_BODY_LIMIT } from '#/routes/hook.js';
import { buildRoutes } from '#/routes/routes.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';

const TICKET: Ticket = {
  id: 'FX-1' as Ticket['id'],
  project: 'fixture',
  title: 'T',
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'waiting_human',
  status_version: 1,
  rework_count: 0,
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
  blocked_by: [],
};

const INTERACTION = {
  id: 'int-1',
  ticket_id: 'FX-1',
  kind: 'question' as const,
  payload: { question: 'which file?' },
  status: 'pending' as const,
  asked_at: '2026-10-13T00:00:00.000Z',
  timeout_at: '2026-10-13T04:00:00.000Z',
};

const INTAKE = {
  source: 'chat',
  kind: 'new_request',
  dedupe_key: 'k1',
  actor: { type: 'user', id: 'u' },
  project: 'fixture',
  payload: { text: 'do it' },
  received_at: '2026-10-13T00:00:00.000Z',
};

let rig: HttpRig;
let storage: StorageAdapter;
let engine: { [K in keyof Engine]: ReturnType<typeof vi.fn> };
const hooks = { handle: vi.fn() };

beforeEach(async () => {
  storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.tickets.insert(TICKET);
    await tx.interactions.insert(INTERACTION);
  });

  engine = {
    tick: vi.fn(),
    requestTick: vi.fn(),
    ingest: vi.fn(async () => ({ status: 'ticket_created', ticketId: 'FX-1' })),
    answerInteraction: vi.fn(async () => true),
    cancelTicket: vi.fn(),
    liveRunIds: vi.fn(() => ['run-a', 'run-b']),
    gateJobsInFlight: vi.fn(() => 1),
  };

  hooks.handle.mockReset();
  hooks.handle.mockResolvedValue({ decision: 'allow', reason: 'ok', receipt_hash: '' });
  rig = await startHttp(
    buildRoutes({
      ...stubHarnessDeps(),
      engine: engine as unknown as Engine,
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      hooks,
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

describe('POST /intake', () => {
  it('hands a valid event to the engine and answers 202 with its result', async () => {
    const res = await rig.json('POST', '/intake', INTAKE);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'ticket_created', ticketId: 'FX-1' });
    expect(engine.ingest).toHaveBeenCalledWith(INTAKE);
  });

  it('rejects an event that fails the schema, listing the fields', async () => {
    const res = await rig.json('POST', '/intake', {
      ...INTAKE,
      source: 'carrier-pigeon',
    });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('source');
    expect(engine.ingest).not.toHaveBeenCalled();
  });

  it('refuses a source nobody registered, even a valid enum value', async () => {
    const res = await rig.json('POST', '/intake', { ...INTAKE, source: 'webhook' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('source');
    expect(engine.ingest).not.toHaveBeenCalled();
  });

  it('refuses a body with no source at all', async () => {
    const res = await rig.json('POST', '/intake', { kind: 'new_request' });

    expect(res.status).toBe(400);
    expect(engine.ingest).not.toHaveBeenCalled();
  });
});

describe('GET /tickets/:id', () => {
  it('returns the ticket with runs, gate results and only pending interactions', async () => {
    await storage.transaction((tx) =>
      tx.interactions.insert({ ...INTERACTION, id: 'int-2', status: 'answered' }),
    );

    const res = await rig.json('GET', '/tickets/FX-1');
    const body = res.body as {
      ticket: { id: string };
      runs: unknown[];
      interactions: { id: string }[];
    };

    expect(res.status).toBe(200);
    expect(body.ticket.id).toBe('FX-1');
    expect(body.runs).toEqual([]);
    expect(body.interactions.map((i) => i.id)).toEqual(['int-1']);
  });

  it('answers 404 for an unknown ticket and 400 for a malformed id', async () => {
    expect((await rig.json('GET', '/tickets/FX-99')).status).toBe(404);
    expect((await rig.json('GET', '/tickets/not-an-id')).status).toBe(400);
  });
});

describe('POST /interactions/:id/answer', () => {
  it('answers 200 when the engine accepts', async () => {
    const res = await rig.json('POST', '/interactions/int-1/answer', {
      answer: 'src/math.js',
    });

    expect(res.status).toBe(200);
    expect(engine.answerInteraction).toHaveBeenCalledWith('int-1', 'src/math.js');
  });

  it('accepts any JSON value as the answer, including null', async () => {
    const res = await rig.json('POST', '/interactions/int-1/answer', { answer: null });

    expect(res.status).toBe(200);
    expect(engine.answerInteraction).toHaveBeenCalledWith('int-1', null);
  });

  it('answers 409 when the engine says it was not pending', async () => {
    engine.answerInteraction?.mockResolvedValueOnce(false);

    expect(
      (await rig.json('POST', '/interactions/int-1/answer', { answer: 'x' })).status,
    ).toBe(409);
  });

  it('answers 404 for an unknown interaction and 400 for a missing answer', async () => {
    expect(
      (await rig.json('POST', '/interactions/int-9/answer', { answer: 'x' })).status,
    ).toBe(404);

    expect((await rig.json('POST', '/interactions/int-1/answer', {})).status).toBe(400);
    expect(engine.answerInteraction).not.toHaveBeenCalled();
  });
});

describe('POST /runs/:id/hook', () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    rig.json('POST', '/runs/run%2D1/hook', body, headers);

  it('passes the run id, the bearer token and the parsed body to the handler', async () => {
    const res = await post('{"event":"SessionStart"}', { authorization: 'Bearer tok-1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ decision: 'allow', reason: 'ok', receipt_hash: '' });
    expect(hooks.handle).toHaveBeenCalledWith('run-1', 'tok-1', {
      event: 'SessionStart',
    });
  });

  it('sends an empty token when there is no bearer header', async () => {
    await post('{}');

    expect(hooks.handle).toHaveBeenCalledWith('run-1', '', {});
  });

  it('hands a non-JSON body to the handler as nothing, so it can deny it', async () => {
    const res = await post('not json', { authorization: 'Bearer t' });

    expect(res.status).toBe(200);
    expect(hooks.handle).toHaveBeenCalledWith('run-1', 't', undefined);
  });

  it('rejects another media type with 415 and never calls the handler', async () => {
    const res = await post('{}', { 'content-type': 'text/plain' });

    expect(res.status).toBe(415);
    expect(hooks.handle).not.toHaveBeenCalled();
  });

  it('allows more than the 1 MiB default, enough for a bounded tool output, but only 2 MiB', () => {
    expect(HOOK_BODY_LIMIT).toBe(2 * 1024 * 1024);
  });

  it('answers 413 to a request over 2 MiB and never calls the handler', async () => {
    const status = await rig.declaredStatus('/runs/run-1/hook', 2 * 1024 * 1024 + 1, {
      authorization: 'Bearer tok-1',
    });

    expect(status).toBe(413);
    expect(hooks.handle).not.toHaveBeenCalled();
  });
});

describe('GET /runs/:id/events errors', () => {
  it('answers 404 for an unknown run and 400 for a bad cursor header', async () => {
    expect((await rig.json('GET', '/runs/run-x/events')).status).toBe(404);

    const bad = await fetch(`${rig.url}/runs/run-x/events`, {
      headers: { 'last-event-id': 'zzz' },
    });

    expect(bad.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('reports owner, uptime and the engine counters', async () => {
    const res = await rig.json('GET', '/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      database: 'ok',
      owner: 'srv-test',
      uptime_s: 5,
      live_runs: 2,
      gate_jobs_in_flight: 1,
    });
  });

  it('answers 503 when the database does not answer', async () => {
    vi.spyOn(storage, 'transaction').mockRejectedValue(new Error('locked'));

    const res = await rig.json('GET', '/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'unavailable' });
  });
});

/**
 * The install token on the real route table: who gets in, who does not.
 *
 * Why: the API controls Workers that can edit code, and any program on this machine can reach
 *   a loopback port. Every route must therefore refuse a caller without the install token
 *   with a bare 401, except `/health` (liveness only) and the hook route (its own per-run
 *   secret). A new route that forgets to declare itself would be caught here, because the
 *   test walks the whole route table. The SSE ticket path (browsers cannot set headers on an
 *   `EventSource`) must work for the run it was issued for, for 60 seconds, and for nothing else.
 *
 * Pins: 401 for no and wrong token on every protected route and on unknown paths; the open
 *   set is exactly /health, the hook route, /auth/open, /auth/proof and /auth/logout; the shutdown request fires after the 202; the
 *   ticket flow (valid, expired, wrong run, tampered, not usable on other routes).
 * Depends on: src/routes/routes, src/services/auth, helpers/http-rig. IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { Run, StorageAdapter } from '@forge/core';
import type { Engine } from '@forge/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { createAuthGuard } from '#/services/auth/guard.js';
import { createSseTicketIssuer } from '#/services/auth/sse-tickets.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { TEST_INSTALL_TOKEN, bearer } from '#tests/helpers/install-token.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';
import type { Route } from '#/types/http.types.js';

const RUN: Run = {
  id: 'run-1',
  ticket_id: 'FX-1',
  harness: 'claude-code',
  driver_version: 'v',
  cwd: '/w',
  lane: 'express',
  started_at: '2026-10-13T00:00:00.000Z',
  status: 'success',
  ended_at: '2026-10-13T00:01:00.000Z',
  owner: 'srv-1',
};

let rig: HttpRig;
let routes: Route[];
let storage: StorageAdapter;
let clock: { now: number };
let requestShutdown: ReturnType<typeof vi.fn<() => void>>;
const hooks = { handle: vi.fn() };

beforeEach(async () => {
  clock = { now: 1_000_000 };
  storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.runs.insert(RUN);
    await tx.runEvents.append('run-1', {
      type: 'text',
      ts: '2026-10-13T00:00:00.000Z',
      text: 'hello',
    });
  });

  hooks.handle.mockReset();
  hooks.handle.mockResolvedValue({ decision: 'allow', reason: 'ok', receipt_hash: '' });
  requestShutdown = vi.fn<() => void>();
  const tickets = createSseTicketIssuer(() => clock.now);
  routes = buildRoutes({
    ...stubHarnessDeps(),
    engine: {
      ingest: vi.fn(),
      liveRunIds: () => [],
      gateJobsInFlight: () => 0,
    } as unknown as Engine,
    storage,
    config: createMemoryConfigSource(),
    ...inertRouteExtras(),
    tickets,
    requestShutdown,
    hooks,
    owner: 'srv-test',
    startedAt: 0,
    now: () => clock.now,
    http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
    shutdown: new AbortController().signal,
  });

  rig = await startHttp(routes, createAuthGuard(TEST_INSTALL_TOKEN, tickets));
});

afterEach(async () => {
  await rig.close();
});

const concrete = (path: string): string => path.replace(/:[a-z]+/g, 'x');

describe('the install token', () => {
  it('is required by every route except /health, the hook route, /auth/open, /auth/proof and /auth/logout', () => {
    const open = routes.filter((r) => r.access === 'open');
    const names = open.map((r) => `${r.method} ${r.path}`).sort();

    expect(names.join(', ')).toBe(
      'GET /auth/open, GET /health, POST /auth/logout, POST /auth/proof, POST /runs/:id/hook',
    );
  });

  it('answers a bare 401 on every protected route without a token', async () => {
    const protectedRoutes = routes.filter((route) => route.access !== 'open');

    for (const route of protectedRoutes) {
      const res = await rig.json(
        route.method,
        concrete(route.path),
        route.method === 'GET' ? undefined : {},
        { authorization: '' },
      );

      expect(res.status, `${route.method} ${route.path}`).toBe(401);
      expect(res.body).toEqual({
        error: { code: 'unauthorized', message: 'unauthorized' },
      });

      expect(res.headers.get('www-authenticate')).toBe('Bearer');
    }
  });

  it.each([
    ['a wrong token', 'Bearer not-the-token'],
    ['the right token under another scheme', `Basic ${TEST_INSTALL_TOKEN}`],
    [
      'a token that is a prefix of the real one',
      `Bearer ${TEST_INSTALL_TOKEN.slice(0, -1)}`,
    ],
    ['the real token with extra characters', `Bearer ${TEST_INSTALL_TOKEN}x`],
  ])('refuses %s', async (_name, authorization) => {
    const res = await rig.json('GET', '/tickets/FX-1', undefined, { authorization });

    expect(res.status).toBe(401);
  });

  it('answers 401 to an unknown path without a token and 404 with one', async () => {
    const anonymous = await rig.json('GET', '/nope', undefined, { authorization: '' });
    const known = await rig.json('GET', '/nope');

    expect(anonymous.status).toBe(401);
    expect(known.status).toBe(404);
  });

  it('lets the right token through', async () => {
    const res = await rig.json('GET', '/tickets/FX-1');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'ticket_not_found' } });
  });

  it('leaves the hook route to its own secret', async () => {
    const res = await rig.json(
      'POST',
      '/runs/run-1/hook',
      { tool: 'x' },
      { authorization: 'Bearer run-token' },
    );

    expect(res.status).toBe(200);
    expect(hooks.handle).toHaveBeenCalledWith('run-1', 'run-token', { tool: 'x' });
  });

  it('serves /health without a token and with nothing but liveness', async () => {
    const res = await rig.json('GET', '/health', undefined, { authorization: '' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'forge', status: 'ok' });
  });
});

describe('POST /admin/shutdown', () => {
  it('answers 202 and then asks for the shutdown', async () => {
    const res = await rig.json('POST', '/admin/shutdown');

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'stopping' });
    await vi.waitFor(() => expect(requestShutdown).toHaveBeenCalledOnce());
  });

  it('does nothing for a caller without the token', async () => {
    const res = await rig.json('POST', '/admin/shutdown', undefined, {
      authorization: '',
    });

    expect(res.status).toBe(401);
    expect(requestShutdown).not.toHaveBeenCalled();
  });
});

describe('SSE tickets', () => {
  async function ticketFor(runId: string): Promise<string> {
    const res = await rig.json('POST', '/auth/sse-ticket', { run_id: runId });

    expect(res.status).toBe(200);

    return (res.body as { ticket: string }).ticket;
  }

  it('is only issued to a caller with the install token', async () => {
    const res = await rig.json(
      'POST',
      '/auth/sse-ticket',
      { run_id: 'run-1' },
      { authorization: '' },
    );

    expect(res.status).toBe(401);
  });

  it('rejects a body without a run id', async () => {
    const res = await rig.json('POST', '/auth/sse-ticket', {});

    expect(res.status).toBe(400);
  });

  it('opens the event stream of its run without any header', async () => {
    const ticket = await ticketFor('run-1');

    const res = await fetch(`${rig.url}/runs/run-1/events?ticket=${ticket}`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('event: end');
  });

  it('reports a 60 second lifetime', async () => {
    const res = await rig.json('POST', '/auth/sse-ticket', { run_id: 'run-1' });

    expect(res.body).toMatchObject({ expires_in_s: 60 });
  });

  it('still works for a reconnect inside the minute and is refused after it', async () => {
    const ticket = await ticketFor('run-1');

    clock.now += 59_000;
    const again = await fetch(`${rig.url}/runs/run-1/events?ticket=${ticket}`);
    await again.text();
    clock.now += 2_000;
    const late = await fetch(`${rig.url}/runs/run-1/events?ticket=${ticket}`);

    expect(again.status).toBe(200);
    expect(late.status).toBe(401);
  });

  it('is refused for a different run', async () => {
    const ticket = await ticketFor('run-1');

    const res = await fetch(`${rig.url}/runs/run-2/events?ticket=${ticket}`);

    expect(res.status).toBe(401);
  });

  it('is refused when its expiry was edited', async () => {
    const ticket = await ticketFor('run-1');
    const [expiry, signature] = ticket.split('.');
    const forged = `${Number(expiry) + 3_600_000}.${signature}`;

    const res = await fetch(`${rig.url}/runs/run-1/events?ticket=${forged}`);

    expect(res.status).toBe(401);
  });

  it('is not accepted on any other route', async () => {
    const ticket = await ticketFor('run-1');

    const res = await fetch(`${rig.url}/tickets/FX-1?ticket=${ticket}`);
    const post = await fetch(`${rig.url}/auth/sse-ticket?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ run_id: 'run-1' }),
    });

    expect(res.status).toBe(401);
    expect(post.status).toBe(401);
  });

  it('is refused when garbage is sent as the ticket', async () => {
    for (const ticket of ['', 'abc', '1.2.3', 'NaN.sig']) {
      const res = await fetch(`${rig.url}/runs/run-1/events?ticket=${ticket}`);

      expect(res.status, ticket).toBe(401);
    }
  });

  it('is not a way around the token for a header-bearing caller', async () => {
    const res = await fetch(`${rig.url}/runs/run-1/events`, {
      headers: bearer(TEST_INSTALL_TOKEN),
    });

    await res.text();

    expect(res.status).toBe(200);
  });
});

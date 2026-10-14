/**
 * `GET /runs/:id/events` at the end of a run: 204 stops EventSource.
 *
 * Why: a browser EventSource reconnects whenever the stream closes, sending the last id it
 * saw. If a finished run answered every reconnect with a fresh 200 stream, a control room
 * tab would reconnect for ever. A 204 is the one answer that makes EventSource stop, so
 * once the run has ended and the client's cursor covers the last event, that is the answer.
 *
 * Pins: ended run + cursor at the last seq -> 204 with no body; ended run without a cursor
 * -> the events and an `end` event; running run -> a stream, not 204.
 * Depends on: src/routes/run-events, helpers/http-rig, @forge/db. IO: a loopback socket.
 */

import { createMemoryStorage } from '@forge/db';
import type { Engine } from '@forge/engine';
import type { Run, StorageAdapter } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';

const RUN: Run = {
  id: 'run-1',
  ticket_id: 'FX-1',
  harness: 'claude-code',
  driver_version: 'v',
  cwd: '/w',
  lane: 'express',
  started_at: '2026-10-13T00:00:00.000Z',
  status: 'running',
  owner: 'srv-1',
};

let rig: HttpRig;
let storage: StorageAdapter;
let stop: AbortController;

async function seed(ended: boolean): Promise<void> {
  await storage.transaction(async (tx) => {
    await tx.runs.insert(
      ended ? { ...RUN, status: 'success', ended_at: '2026-10-13T00:01:00.000Z' } : RUN,
    );

    for (const n of [1, 2]) {
      await tx.runEvents.append('run-1', {
        type: 'text',
        ts: '2026-10-13T00:00:00.000Z',
        text: `event ${n}`,
      });
    }
  });
}

beforeEach(async () => {
  storage = createMemoryStorage();
  stop = new AbortController();
  rig = await startHttp(
    buildRoutes({
      engine: {} as unknown as Engine,
      storage,
      hooks: {
        handle: async () => ({ decision: 'allow', reason: 'ok', receipt_hash: '' }),
      },
      owner: 'srv-test',
      startedAt: 0,
      now: () => 0,
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: stop.signal,
    }),
  );
});

afterEach(async () => {
  stop.abort();
  await rig.close();
});

describe('GET /runs/:id/events after the run ended', () => {
  it('answers 204 when the cursor covers the last event', async () => {
    await seed(true);

    const res = await fetch(`${rig.url}/runs/run-1/events`, {
      headers: { 'last-event-id': '1' },
    });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('streams the events and an end event to a client without a cursor', async () => {
    await seed(true);

    const res = await fetch(`${rig.url}/runs/run-1/events`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('id: 0');
    expect(body).toContain('id: 1');
    expect(body).toContain('event: end');
  });

  it('streams the tail to a client that is behind, then ends', async () => {
    await seed(true);

    const res = await fetch(`${rig.url}/runs/run-1/events?after=0`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).not.toContain('id: 0');
    expect(body).toContain('id: 1');
  });

  it('does not answer 204 while the run is still going', async () => {
    await seed(false);
    const abort = new AbortController();
    const res = await fetch(`${rig.url}/runs/run-1/events`, {
      headers: { 'last-event-id': '1' },
      signal: abort.signal,
    });

    expect(res.status).toBe(200);
    abort.abort();
    await res.body?.cancel().catch(() => undefined);
  });
});

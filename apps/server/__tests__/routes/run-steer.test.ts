/**
 * `POST /runs/:id/steer`: a person messages a running Worker.
 *
 * Why: the ticket page sends the user's message to the Worker's run. The caller must learn
 *   exactly why a message was not sent (bad body, no such run, run not live, harness cannot
 *   steer, server stopping) and must never see success for a message the engine did not
 *   deliver, because a person who thinks the Worker was told will wait for it to react.
 *
 * Pins: success passes message and author to the engine and answers the inbox sequence;
 *   400 for a missing, empty, whitespace-only or over-long message and a missing author;
 *   404 unknown run; 409 `run_not_live` when the engine says so or another server owns the
 *   run; 409 `steer_unsupported`; 503 `server_draining` before the engine is asked; no
 *   token is 401.
 * Depends on: src/routes/run-steer via buildRoutes, helpers/http-rig, @forge/db. IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { Run } from '@forge/core';
import type { Engine, SteerRunResult } from '@forge/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';

const RUN: Run = {
  id: 'run-1',
  ticket_id: 'FX-1',
  harness: 'claude-code',
  driver_version: 'v',
  cwd: '/w',
  lane: 'express',
  started_at: '2026-10-13T00:00:00.000Z',
  status: 'running',
  owner: 'srv-test',
};

const GOOD = { message: 'use the v2 API', author: 'vikash' };

let rig: HttpRig;
let draining: boolean;
let steerRun: ReturnType<typeof vi.fn<Engine['steerRun']>>;

async function start(over: Partial<Run> = {}): Promise<void> {
  const storage = createMemoryStorage();
  await storage.transaction((tx) => tx.runs.insert({ ...RUN, ...over }));
  rig = await startHttp(
    buildRoutes({
      ...stubHarnessDeps(),
      engine: { steerRun } as unknown as Engine,
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      hooks: { handle: vi.fn() },
      isDraining: () => draining,
      owner: 'srv-test',
      startedAt: 0,
      now: () => 0,
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );
}

const post = (body: unknown, id = 'run-1') => rig.json('POST', `/runs/${id}/steer`, body);

beforeEach(() => {
  draining = false;
  steerRun = vi.fn<Engine['steerRun']>(async (): Promise<SteerRunResult> => ({
    status: 'delivered',
    inboxSeq: 3,
  }));
});

afterEach(async () => {
  await rig.close();
});

describe('POST /runs/:id/steer', () => {
  it('delivers through the engine and answers the inbox sequence', async () => {
    await start();

    const res = await post(GOOD);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      run_id: 'run-1',
      inbox_seq: 3,
      mode: 'steer',
      status: 'delivered',
    });

    expect(steerRun).toHaveBeenCalledWith('run-1', 'use the v2 API', 'vikash');
  });

  it('trims the message and author before the engine sees them', async () => {
    await start();

    await post({ message: '  hi  ', author: ' me ' });

    expect(steerRun).toHaveBeenCalledWith('run-1', 'hi', 'me');
  });

  it.each([
    ['no message', { author: 'a' }],
    ['an empty message', { message: '', author: 'a' }],
    ['a whitespace-only message', { message: '   ', author: 'a' }],
    ['a message over 8000 chars', { message: 'x'.repeat(8001), author: 'a' }],
    ['no author', { message: 'hi' }],
    ['an unknown field', { ...GOOD, mode: 'interrupt' }],
  ])('refuses %s with 400', async (_name, body) => {
    await start();

    expect((await post(body)).status).toBe(400);
    expect(steerRun).not.toHaveBeenCalled();
  });

  it('accepts a message of exactly 8000 chars', async () => {
    await start();

    expect((await post({ message: 'x'.repeat(8000), author: 'a' })).status).toBe(200);
  });

  it('answers 404 for an unknown run', async () => {
    await start();

    const res = await post(GOOD, 'run-404');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'run_not_found' } });
    expect(steerRun).not.toHaveBeenCalled();
  });

  it('answers 409 run_not_live when the engine says the run is not live', async () => {
    await start();
    steerRun.mockResolvedValue({ status: 'not_live' });

    const res = await post(GOOD);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'run_not_live' } });
  });

  it('answers 409 run_not_live for a run another server owns, without asking the engine', async () => {
    await start({ owner: 'srv-other' });

    const res = await post(GOOD);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'run_not_live' } });
    expect(steerRun).not.toHaveBeenCalled();
  });

  it('answers 409 steer_unsupported when the harness cannot steer', async () => {
    await start();
    steerRun.mockResolvedValue({ status: 'unsupported' });

    const res = await post(GOOD);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'steer_unsupported' } });
  });

  it('answers 503 server_draining while the server is stopping', async () => {
    await start();
    draining = true;

    const res = await post(GOOD);

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'server_draining' } });
    expect(steerRun).not.toHaveBeenCalled();
  });

  it('needs the install token or a browser session', async () => {
    await start();

    const res = await rig.json('POST', '/runs/run-1/steer', GOOD, {
      authorization: '',
    });

    expect(res.status).toBe(401);
    expect(steerRun).not.toHaveBeenCalled();
  });
});

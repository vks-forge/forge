/**
 * Pins: hook liveness registration and its enforcement on tool calls (d-0033).
 *
 * Why: tool calls are receipted only if the harness runs our hook. The first SessionStart
 * proves it, and later ones (resume, compact, clear) must not move that proof. A run whose
 * tool call arrives before any registration is not known to be observed, so when liveness
 * is required the call is denied and leaves no receipt.
 *
 * Depends on: helpers/fixtures, src/server/liveness-recorder, @forge/db.
 */

import { createMemoryStorage } from '@forge/db';
import type { StorageAdapter } from '@forge/core';
import { describe, expect, it, vi } from 'vitest';
import { createLivenessRecorder } from '#/index.js';
import { RUN_ID, TOKEN, makeEnv, pre } from '#tests/helpers/fixtures.js';

const req = (payload: { hook_event_name: string }) => ({
  event: payload.hook_event_name,
  payload,
  seq: 1,
});

async function runStorage(): Promise<StorageAdapter> {
  const storage = createMemoryStorage();
  await storage.transaction((tx) =>
    tx.runs.insert({
      id: 'run-1',
      ticket_id: 'FX-1',
      harness: 'claude-code',
      driver_version: 'v',
      cwd: '/w',
      lane: 'express',
      started_at: '2026-10-13T00:00:00.000Z',
      status: 'running',
      owner: 'srv',
    }),
  );

  return storage;
}

describe('createLivenessRecorder', () => {
  it('stores the event and the timestamp on the first SessionStart, then notifies', async () => {
    const storage = await runStorage();
    const onRegistered = vi.fn();
    const record = createLivenessRecorder({
      storage,
      now: () => new Date('2026-10-13T00:00:05.000Z'),
      onRegistered,
    });

    await record('run-1', { session_id: 'sess-1' });
    const { events, run } = await storage.transaction(async (tx) => ({
      events: await tx.runEvents.listByRun('run-1'),
      run: await tx.runs.get('run-1'),
    }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'hook_liveness',
      ts: '2026-10-13T00:00:05.000Z',
    });

    expect(run?.hook_registered_at).toBe('2026-10-13T00:00:05.000Z');
    expect(onRegistered).toHaveBeenCalledOnce();
  });

  it('ignores a later SessionStart (resume, compact, clear): no event, same timestamp, no wake', async () => {
    const storage = await runStorage();
    const onRegistered = vi.fn();
    let second = false;
    const record = createLivenessRecorder({
      storage,
      now: () =>
        new Date(second ? '2026-10-13T01:00:00.000Z' : '2026-10-13T00:00:05.000Z'),
      onRegistered,
    });

    await record('run-1', { session_id: 'sess-1', source: 'startup' });
    second = true;
    await record('run-1', { session_id: 'sess-1', source: 'compact' });
    const { events, run } = await storage.transaction(async (tx) => ({
      events: await tx.runEvents.listByRun('run-1'),
      run: await tx.runs.get('run-1'),
    }));

    expect(events).toHaveLength(1);
    expect(run?.hook_registered_at).toBe('2026-10-13T00:00:05.000Z');
    expect(onRegistered).toHaveBeenCalledOnce();
  });

  it('does nothing for a run that does not exist', async () => {
    const onRegistered = vi.fn();
    const record = createLivenessRecorder({
      storage: createMemoryStorage(),
      now: () => new Date(),
      onRegistered,
    });

    await record('ghost', {});

    expect(onRegistered).not.toHaveBeenCalled();
  });
});

describe('hook handler: liveness required', () => {
  it('denies a tool call that arrives before the hook registered, and records no receipt', async () => {
    const env = makeEnv({ requireLiveness: true });
    await env.ready;

    const res = await env.handler.handle(RUN_ID, TOKEN, req(pre('Bash', 'ls', 'tu1')));

    expect(res).toMatchObject({ decision: 'deny', reason: 'fail_closed_no_liveness' });
    expect(await env.receipts.list(RUN_ID)).toEqual([]);
    expect(env.admitted).toEqual([]);
  });

  it('serves the tool call once liveness is registered', async () => {
    const env = makeEnv({ requireLiveness: true });
    await env.ready;
    await env.db.transaction((tx) =>
      tx.runs.update(RUN_ID, { hook_registered_at: '2026-10-13T00:00:01.000Z' }),
    );

    const res = await env.handler.handle(RUN_ID, TOKEN, req(pre('Bash', 'ls', 'tu1')));

    expect(res.decision).toBe('allow');
  });

  it('does not require liveness unless asked', async () => {
    const env = makeEnv();
    await env.ready;

    const res = await env.handler.handle(RUN_ID, TOKEN, req(pre('Bash', 'ls', 'tu1')));

    expect(res.decision).toBe('allow');
  });
});

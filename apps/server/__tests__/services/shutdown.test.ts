/**
 * Graceful shutdown: order, bounded waiting, and resilience to a failing step.
 *
 * Why: a stopped server must not leave Workers running or the database open under a write.
 *   The order is the contract: the tick stops first, live runs are cancelled by run id,
 *   gate jobs get a bounded time to drain (a merge decided on a passed gate should survive a
 *   Ctrl-C, but a hung gate must not hold the process forever), and only then do the streams,
 *   the port and the database close. One failing step must not stop the rest.
 *
 * Pins: step order, cancel per live run, drain until zero jobs, give up at the grace
 *   deadline, continue after a failing cancel.
 * Depends on: src/services/shutdown. No IO.
 */

import type { Engine } from '@forge/engine';
import { describe, expect, it, vi } from 'vitest';
import { shutdownServer } from '#/services/shutdown.js';
import type { ShutdownParts } from '#/types/server.types.js';

function rig(
  over: {
    live?: string[] | (() => string[]);
    jobs?: () => number;
    cancel?: () => Promise<void>;
    stop?: () => Promise<void>;
  } = {},
) {
  const order: string[] = [];
  const log = vi.fn();
  const engine = {
    liveRunIds: () => (typeof over.live === 'function' ? over.live() : (over.live ?? [])),
    gateJobsInFlight: over.jobs ?? (() => 0),
  } as unknown as Engine;

  const parts: ShutdownParts = {
    ticker: {
      start: vi.fn(),
      requestTick: vi.fn(),
      stop: async () => {
        order.push('ticker');
        await over.stop?.();
      },
    },
    engine,
    driver: {
      cancel: async (handle: { runId: string }) => {
        order.push(`cancel ${handle.runId}`);
        await over.cancel?.();
      },
    } as unknown as ShutdownParts['driver'],
    storage: { close: async () => void order.push('storage'), transaction: vi.fn() },
    endStreams: () => void order.push('streams'),
    closeHttp: async () => void order.push('http'),
    graceMs: 50,
    log,
    sleep: async () => undefined,
  };

  return { parts, order, log };
}

describe('shutdownServer', () => {
  it('stops the clock, cancels runs, then closes streams, port and database in order', async () => {
    const { parts, order } = rig({ live: ['run-1', 'run-2'] });

    await shutdownServer(parts);

    expect(order).toEqual([
      'ticker',
      'cancel run-1',
      'cancel run-2',
      'streams',
      'http',
      'storage',
    ]);
  });

  it('waits for gate jobs to drain before closing', async () => {
    let jobs = 3;
    const { parts, order } = rig({ jobs: () => jobs-- });

    await shutdownServer({ ...parts, graceMs: 10_000 });

    expect(jobs).toBeLessThan(0);
    expect(order.at(-1)).toBe('storage');
  });

  it('gives up on gate jobs at the grace deadline and says so', async () => {
    const { parts, order, log } = rig({ jobs: () => 1 });

    await shutdownServer({ ...parts, graceMs: 0 });

    expect(order.at(-1)).toBe('storage');
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('gate job(s) still running'),
    );
  });

  it('keeps going when a cancel fails', async () => {
    const { parts, order, log } = rig({
      live: ['run-1'],
      cancel: async () => {
        throw new Error('already gone');
      },
    });

    await shutdownServer(parts);

    expect(order.at(-1)).toBe('storage');
    expect(log).toHaveBeenCalledWith(
      'warn',
      'shutdown: cancel run-1 failed',
      expect.objectContaining({ error: 'Error: already gone' }),
    );
  });

  it('cancels live runs while the tick is still running and gives up on a hung tick (H2)', async () => {
    const { parts, order, log } = rig({
      live: ['run-1'],
      stop: () => new Promise<void>(() => undefined),
    });

    await shutdownServer({ ...parts, graceMs: 30 });

    expect(order.indexOf('cancel run-1')).toBeGreaterThan(order.indexOf('ticker'));
    expect(order.slice(-3)).toEqual(['streams', 'http', 'storage']);
    expect(log).toHaveBeenCalledWith(
      'warn',
      'shutdown: a tick is still running; closing anyway',
    );
  });

  it('does not wait forever for a cancel that never settles', async () => {
    const { parts, order, log } = rig({
      live: ['run-1'],
      cancel: () => new Promise<void>(() => undefined),
    });

    await shutdownServer({ ...parts, graceMs: 30 });

    expect(order.at(-1)).toBe('storage');
    expect(log).toHaveBeenCalledWith(
      'warn',
      'shutdown: cancel did not finish within the grace window',
    );
  });

  it('cancels again the runs a tick started while shutdown waited for it', async () => {
    let calls = 0;
    const { parts, order } = rig({
      live: () => (calls++ === 0 ? ['run-1'] : ['run-1', 'run-late']),
    });

    await shutdownServer(parts);

    expect(order).toContain('cancel run-late');
  });

  it('disposes the external ports before closing the database', async () => {
    const { parts, order } = rig();

    await shutdownServer({ ...parts, disposePorts: () => void order.push('dispose') });

    expect(order.slice(-3)).toEqual(['http', 'dispose', 'storage']);
  });
});

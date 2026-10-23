/**
 * Graceful shutdown: Director steps get a bounded time to finish, then are abandoned.
 *
 * Why: the Director's own steps (planning turns, triage, steering replies, the brief of a Worker
 *   run) run as jobs beside the tick. A stopped server should let one that is mid-write finish, but
 *   a hung model call must not hold the process: its debt is stored (the card reply queue, the
 *   ticket's own state), the claims are released at the next start and the step runs again.
 *
 * Pins: with steps in flight shutdown waits for them (up to `engine.shutdown_drain_ms`, at most half
 *   the remaining grace window) before it closes anything; steps that outlast the wait are named in a
 *   warning and shutdown goes on to close the doors; with no steps in flight it does not wait.
 * Depends on: src/services/shutdown. No IO.
 */

import type { Engine } from '@forge/engine';
import { describe, expect, it, vi } from 'vitest';
import { shutdownServer } from '#/services/shutdown.js';
import type { ShutdownParts } from '#/types/server.types.js';

function rig(over: { jobs: number; idle: () => Promise<void>; drainMs?: number }) {
  const order: string[] = [];
  const log = vi.fn();
  const engine = {
    liveRunIds: () => [],
    gateJobsInFlight: () => 0,
    directorJobsInFlight: () => over.jobs,
    idle: async () => {
      order.push('idle begins');
      await over.idle();
      order.push('idle ends');
    },
  } as unknown as Engine;

  const parts: ShutdownParts = {
    ticker: {
      start: vi.fn(),
      requestTick: vi.fn(),
      stop: async () => void order.push('ticker'),
    },
    engine,
    interruptRun: async () => undefined,
    storage: { close: async () => void order.push('storage'), transaction: vi.fn() },
    endStreams: () => void order.push('streams'),
    closeHttp: async () => void order.push('http'),
    drainMs: async () => over.drainMs ?? 1000,
    graceMs: 10_000,
    log,
    sleep: async () => undefined,
  };

  return { parts, order, log };
}

describe('shutdownServer with Director steps in flight', () => {
  it('waits for the steps to finish before it closes anything', async () => {
    const { parts, order } = rig({
      jobs: 2,
      idle: () => new Promise((resolve) => setTimeout(resolve, 20)),
    });

    await shutdownServer(parts);

    expect(order).toEqual([
      'ticker',
      'idle begins',
      'idle ends',
      'streams',
      'http',
      'storage',
    ]);
  });

  it('abandons steps that outlast the drain time and still closes the doors', async () => {
    const { parts, order, log } = rig({
      jobs: 1,
      idle: () => new Promise(() => undefined),
      drainMs: 30,
    });

    await shutdownServer(parts);

    expect(order).toEqual(['ticker', 'idle begins', 'streams', 'http', 'storage']);
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('Director steps still running; abandoning them'),
    );
  });

  it('does not wait when no step is in flight', async () => {
    const { parts, order } = rig({ jobs: 0, idle: () => new Promise(() => undefined) });

    await shutdownServer(parts);

    expect(order).toEqual(['ticker', 'streams', 'http', 'storage']);
  });
});

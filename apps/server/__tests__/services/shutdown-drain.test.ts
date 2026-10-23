/**
 * Graceful shutdown: the drain comes before the interrupt.
 *
 * Why: stopping Forge inside a Worker's Write (edit on disk, effect receipt not yet posted)
 *   makes the resumed run fail G1 and costs a rework run. So shutdown first stops admitting new
 *   tool calls and waits, for a bounded time, until the live runs have no call in flight, and
 *   only then marks them interrupted (d-0092). A call that never completes must not hold the
 *   process: at the timeout the run is interrupted anyway, as before, and G1 fails that claim
 *   closed.
 *
 * Pins: begin, wait for the live runs, interrupt, in that order; the wait uses the configured
 *   `engine.shutdown_drain_ms`, capped at half the grace window so the interrupts keep time; a
 *   zero wait does not wait but still refuses new calls; runs still in flight at the timeout
 *   are named in a warning and interrupted; a failing drain or config read changes nothing.
 * Depends on: src/services/shutdown. No IO.
 */

import type { Engine } from '@forge/engine';
import { describe, expect, it, vi } from 'vitest';
import { shutdownServer } from '#/services/shutdown.js';
import type { ShutdownParts } from '#/types/server.types.js';

function rig(
  over: {
    live?: string[];
    drainMs?: () => Promise<number>;
    stillBusy?: string[];
    awaitQuiet?: () => Promise<string[]>;
  } = {},
) {
  const order: string[] = [];
  const log = vi.fn();
  const waits: number[] = [];
  const engine = {
    liveRunIds: () => over.live ?? [],
    gateJobsInFlight: () => 0,
    directorJobsInFlight: () => 0,
  } as unknown as Engine;

  const parts: ShutdownParts = {
    ticker: {
      start: vi.fn(),
      requestTick: vi.fn(),
      stop: async () => void order.push('ticker'),
    },
    engine,
    interruptRun: async (runId: string) => void order.push(`interrupt ${runId}`),
    storage: { close: async () => void order.push('storage'), transaction: vi.fn() },
    endStreams: () => void order.push('streams'),
    closeHttp: async () => void order.push('http'),
    drain: {
      begin: () => void order.push('drain begin'),
      isDraining: () => true,
      awaitQuiet: async (ids, ms) => {
        order.push(`drain wait ${ids.join(',')}`);
        waits.push(ms);

        return over.awaitQuiet ? over.awaitQuiet() : (over.stillBusy ?? []);
      },
    },
    drainMs: over.drainMs ?? (async () => 10_000),
    graceMs: 60_000,
    log,
    sleep: async () => undefined,
  };

  return { parts, order, log, waits };
}

describe('shutdownServer with a drain', () => {
  it('stops admitting calls, waits for the live runs, then interrupts them', async () => {
    const { parts, order } = rig({ live: ['run-1', 'run-2'] });

    await shutdownServer(parts);

    expect(order).toEqual([
      'ticker',
      'drain begin',
      'drain wait run-1,run-2',
      'interrupt run-1',
      'interrupt run-2',
      'streams',
      'http',
      'storage',
    ]);
  });

  it('waits the configured time', async () => {
    const { parts, waits } = rig({ live: ['run-1'], drainMs: async () => 4_000 });

    await shutdownServer(parts);

    expect(waits).toEqual([4_000]);
  });

  it('caps the wait at half of what is left of the grace window', async () => {
    const { parts, waits } = rig({ live: ['run-1'], drainMs: async () => 10_000 });

    await shutdownServer({ ...parts, graceMs: 2_000 });

    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeLessThanOrEqual(1_000);
    expect(waits[0]).toBeGreaterThan(0);
  });

  it('does not wait for a zero drain time but still refuses new calls', async () => {
    const { parts, order, waits } = rig({ live: ['run-1'], drainMs: async () => 0 });

    await shutdownServer(parts);

    expect(waits).toEqual([]);
    expect(order).toContain('drain begin');
    expect(order).toContain('interrupt run-1');
  });

  it('begins the drain even when no run is live, and waits for nothing', async () => {
    const { parts, order, waits } = rig({ live: [] });

    await shutdownServer(parts);

    expect(order).toContain('drain begin');
    expect(waits).toEqual([]);
  });

  it('names the runs still in flight at the timeout and interrupts them anyway', async () => {
    const { parts, order, log } = rig({ live: ['run-1'], stillBusy: ['run-1'] });

    await shutdownServer(parts);

    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('still had a tool call in flight'),
      expect.objectContaining({ runs: ['run-1'] }),
    );

    expect(order).toContain('interrupt run-1');
  });

  it('interrupts anyway when the drain fails or the setting cannot be read', async () => {
    const failing = rig({
      live: ['run-1'],
      awaitQuiet: async () => {
        throw new Error('db closed');
      },
    });

    await shutdownServer(failing.parts);
    expect(failing.order).toContain('interrupt run-1');

    const unreadable = rig({
      live: ['run-1'],
      drainMs: async () => {
        throw new Error('no config');
      },
    });

    await shutdownServer(unreadable.parts);
    expect(unreadable.order).toContain('interrupt run-1');
    expect(unreadable.waits).toEqual([10_000]);
  });
});

/**
 * The tick clock.
 *
 * Why: the engine owns no timers, so the ticker is what keeps tickets moving: it must
 *   coalesce a burst of "tick now" requests into one tick, never queue a backlog behind a
 *   slow tick, survive a tick that throws, and let `stop()` wait for a tick in flight so
 *   shutdown never closes the database under a running phase.
 *
 * Pins: coalescing, one pending tick during a slow tick, first tick on start, error
 *   survival, stop waits and silences.
 * Depends on: src/services/ticker. No IO beyond timers.
 */

import { describe, expect, it, vi } from 'vitest';
import { createTicker } from '#/services/ticker.js';

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('createTicker', () => {
  it('runs one tick for many requests in the same turn', async () => {
    const tick = vi.fn(async () => undefined);
    const ticker = createTicker({ tick, intervalMs: 60_000, log: vi.fn() });

    ticker.requestTick();
    ticker.requestTick();
    ticker.requestTick();
    await nextTurn();
    await ticker.stop();

    expect(tick).toHaveBeenCalledOnce();
  });

  it('ticks once at start and then on the interval', async () => {
    const tick = vi.fn(async () => undefined);
    const ticker = createTicker({ tick, intervalMs: 20, log: vi.fn() });

    ticker.start();
    await new Promise((resolve) => setTimeout(resolve, 90));
    await ticker.stop();

    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('logs a failing tick and keeps ticking', async () => {
    const log = vi.fn();
    const tick = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);

    const ticker = createTicker({ tick, intervalMs: 60_000, log });

    ticker.requestTick();
    await nextTurn();
    ticker.requestTick();
    await nextTurn();
    await ticker.stop();

    expect(tick).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('error', 'tick failed', { error: 'Error: boom' });
  });

  it('keeps one pending tick, not a backlog, while a slow tick runs', async () => {
    const releases: Array<() => void> = [];
    const tick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );

    const ticker = createTicker({ tick, intervalMs: 60_000, log: vi.fn() });
    ticker.requestTick();
    await nextTurn();

    for (let i = 0; i < 6; i++) {
      ticker.requestTick();
      await nextTurn();
    }

    releases[0]?.();
    await nextTurn();
    releases[1]?.();
    await ticker.stop();

    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('waits for the tick in flight on stop and ignores later requests', async () => {
    let finish: () => void = () => undefined;
    const tick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const ticker = createTicker({ tick, intervalMs: 60_000, log: vi.fn() });
    ticker.requestTick();
    await nextTurn();

    let stopped = false;
    const stopping = ticker.stop().then(() => {
      stopped = true;
    });

    await nextTurn();
    expect(stopped).toBe(false);
    finish();
    await stopping;
    ticker.requestTick();
    await nextTurn();

    expect(tick).toHaveBeenCalledOnce();
  });
});

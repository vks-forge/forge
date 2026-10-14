/**
 * The engine's clock: a periodic tick plus coalesced "tick now" requests.
 *
 * Why: the engine owns no timers (d-0058); the app drives it. A tick every
 *   `tick_interval_ms` is the safety net that finds stalls and expired questions, and an
 *   immediate tick on intake, run events and hook liveness keeps a new ticket from waiting
 *   half a minute. Many requests inside one turn of the event loop become one tick, and
 *   a request that arrives during a tick sets one flag and runs one more tick afterwards,
 *   never a backlog (a slow tick must not queue a dozen behind it). A tick
 *   that throws is logged and never kills the timer. `stop()` waits for the tick in flight,
 *   so shutdown does not close the database under a running phase.
 *
 * Exports: createTicker().
 * Depends on: types/server. No IO of its own (timers only).
 */

import type { Logger } from '@forge/engine';
import type { Ticker } from '#/types/server.types.js';

/** Builds a ticker over `tick`; nothing runs until `start()`. */
export function createTicker(opts: {
  tick: () => Promise<unknown>;
  intervalMs: number;
  log: Logger;
}): Ticker {
  let timer: NodeJS.Timeout | null = null;
  let scheduled = false;
  let stopped = false;
  let running = false;
  let pending = false;
  let inFlight: Promise<void> = Promise.resolve();

  const loop = async (): Promise<void> => {
    try {
      do {
        pending = false;
        try {
          await opts.tick();
        } catch (error) {
          opts.log('error', 'tick failed', { error: String(error) });
        }
      } while (pending && !stopped);
    } finally {
      running = false;
    }
  };

  // Single flight: a request during a tick leaves one flag, never a queue of ticks.
  const fire = (): void => {
    if (stopped) {
      return;
    }

    if (running) {
      pending = true;

      return;
    }

    running = true;
    inFlight = loop();
  };

  const requestTick = (): void => {
    if (stopped || scheduled) {
      return;
    }

    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      fire();
    });
  };

  return {
    start() {
      stopped = false;
      timer = setInterval(fire, opts.intervalMs);
      requestTick();
    },
    requestTick,
    async stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      await inFlight;
    },
  };
}

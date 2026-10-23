/**
 * The wake timer: one clock timer for the soonest moment a waiting ticket becomes startable.
 *
 * Why: most things that make work startable are events (an answer, a settled run) and ask for a
 *   tick themselves. Three are not: a wake with a `not_before`, a harness parked until its quota
 *   reset, and a failed step's hold-off all become ready when time passes and nothing happens.
 *   Without a timer the ticket would wait for the next periodic tick (up to the tick interval)
 *   after its time. At the end of every tick the engine finds the soonest such moment and sets
 *   one timer for it, replacing the old one; when it fires it asks for a tick like any event.
 *   The periodic tick stays as the safety sweep.
 *
 * Exports: armWakeTimer(), MAX_TIMER_MS.
 * Depends on: shared/time, tick/tick-requests, types/engine-state. IO only through the storage port.
 */

import { FAR_FUTURE } from '#/shared/time.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Longest single timer; a later moment is picked up by the next tick, which re-arms. */
export const MAX_TIMER_MS = 10 * 60_000;

/** The soonest future moment (epoch ms) a wake, a harness pause or a hold ends, or null. */
async function soonest(ctx: EngineCtx): Promise<number | null> {
  const { now, state } = ctx;
  const times: number[] = [];

  await ctx.deps.storage.transaction(async (tx) => {
    for (const wake of await tx.wakeRequests.listDue(FAR_FUTURE)) {
      if (wake.not_before !== undefined) {
        times.push(Date.parse(wake.not_before));
      }
    }

    for (const paused of await tx.harnessState.list()) {
      times.push(Date.parse(paused.paused_until));
    }
  });

  for (const hold of state.holds.values()) {
    times.push(hold.until);
  }

  const future = times.filter((t) => Number.isFinite(t) && t > now);

  return future.length > 0 ? Math.min(...future) : null;
}

/** Replaces the wake timer with one for the soonest future moment; clears it when there is none. */
export async function armWakeTimer(ctx: EngineCtx): Promise<void> {
  const { deps, state } = ctx;
  const at = await soonest(ctx);

  state.wakeTimer?.cancel();
  state.wakeTimer = null;
  if (at === null) {
    return;
  }

  const delay = Math.min(Math.max(at - deps.clock.now(), 0), MAX_TIMER_MS);
  const cancel = deps.clock.after(delay, () => {
    state.wakeTimer = null;
    requestTick(deps, state);
  });

  state.wakeTimer = { at, cancel };
}

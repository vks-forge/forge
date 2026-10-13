/**
 * Coalesced "please tick now" requests.
 *
 * Why: the engine has no timers (the app drives the clock), yet an intake event, a run
 *   event or a settled run should not wait up to 30 s for the next scheduled tick. Each
 *   such source calls `requestTick`; the app gets one callback however many sources fire,
 *   and a request made while a tick runs asks for exactly one follow-up tick afterwards
 *   instead of re-entering the running one.
 *
 * Exports: requestTick(), beginTick(), endTick().
 * Depends on: types/engine, types/engine-state. No IO.
 */

import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** Asks the app for an immediate tick; no-op while one is already requested. */
export function requestTick(deps: EngineDeps, state: EngineState): void {
  if (state.running) {
    state.requested = true;
    return;
  }
  if (state.notified) return;
  state.notified = true;
  deps.onTickRequested?.();
}

/** A tick starts: pending requests are about to be served. */
export function beginTick(state: EngineState): void {
  state.notified = false;
  state.requested = false;
}

/** A tick ended: if something asked for one meanwhile, ask the app again. */
export function endTick(deps: EngineDeps, state: EngineState): void {
  state.running = null;
  if (state.requested) {
    state.requested = false;
    requestTick(deps, state);
  }
}

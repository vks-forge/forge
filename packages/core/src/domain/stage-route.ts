/**
 * Blocking route — where a stage's blocking result goes: rework, hold, or the rework cap.
 *
 * Why: a stop is not always the same stop. A failed deterministic gate (G1, the owner's script)
 *   has no "merge anyway": it blocks until the work is fixed, and once the automatic reworks are
 *   spent the owner chooses Retry, Re-plan or Cancel. A reviewer or the Director's check is
 *   judgement, which the owner may overrule, so its findings send the work back while reworks
 *   remain (d-0165) and then hold the ticket for the owner instead of dead-ending it (d-0071); a
 *   stage set to hold never spends a rework at all. A failed G1 that is only gate configuration holds at once for the owner, no rework spent (d-0173); one that is only the lost proof of an earlier run reworks while the cap allows (the Worker re-applies the files), then holds for the owner (F-D3). The engine asks this one pure function at
 *   every place a stage blocks, so Express, Standard and Full cannot drift apart.
 *
 * Exports: blockingRoute().
 * Depends on: types/stage-route. No IO.
 */

import type { BlockRoute, BlockRouteInput } from '#/types/stage-route.types.js';

/** The route for one blocking result. Gates hold only for config-only failures, and for provenance-only ones once the cap is spent; checks never rework at or past the cap. */
export function blockingRoute(input: BlockRouteInput): BlockRoute {
  const spent = input.reworkCount >= input.cap;
  if (input.klass === 'gate') {
    // Rework cannot fix a file the ticket asked for; only the owner can say it is fine (d-0173).
    if (input.configOnly === true) {
      return 'hold';
    }

    // A rewrite through the Worker's own tools can restore the proof; when it cannot, the owner can vouch (F-D3).
    if (input.provenanceOnly === true) {
      return spent ? 'hold' : 'rework';
    }

    return spent ? 'rework_cap' : 'rework';
  }

  if (input.policy === 'hold' || spent) {
    return 'hold';
  }

  return 'rework';
}

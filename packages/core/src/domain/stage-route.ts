/**
 * Blocking route — where a stage's blocking result goes: rework, hold, or the rework cap.
 *
 * Why: a stop is not always the same stop. A failed deterministic gate (G1, the owner's script)
 *   has no "merge anyway": it blocks until the work is fixed, and once the automatic reworks are
 *   spent the owner chooses Retry, Re-plan or Cancel. A reviewer or the Director's check is
 *   judgement, which the owner may overrule, so its findings send the work back while reworks
 *   remain (d-0165) and then hold the ticket for the owner instead of dead-ending it (d-0071); a
 *   stage set to hold never spends a rework at all. The engine asks this one pure function at
 *   every place a stage blocks, so Express, Standard and Full cannot drift apart.
 *
 * Exports: blockingRoute().
 * Depends on: types/stage-route. No IO.
 */

import type { BlockRoute, BlockRouteInput } from '#/types/stage-route.types.js';

/** The route for one blocking result. Gates never hold; checks never rework at or past the cap. */
export function blockingRoute(input: BlockRouteInput): BlockRoute {
  const spent = input.reworkCount >= input.cap;
  if (input.klass === 'gate') {
    return spent ? 'rework_cap' : 'rework';
  }

  if (input.policy === 'hold' || spent) {
    return 'hold';
  }

  return 'rework';
}

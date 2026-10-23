/**
 * tickToIdle: one tick plus the follow-up ticks that finished Director and gate jobs ask for.
 *
 * Why: scenario tests read "the tick that merged" or "the tick that started the Worker", but gate
 *   runs and Director steps (card turns, triage, steer replies, the brief of a run) now run beside the
 *   tick and are collected by the next one. This drives the engine through that chain so a scenario
 *   keeps reading as one step.
 *
 * Exports: tickToIdle().
 * Depends on: helpers/merge-reports, types/engine (Engine, TickReport). No IO.
 */

import type { Engine, TickReport } from '#/types/engine.types.js';
import { mergeReports } from '#tests/helpers/merge-reports.js';

/**
 * One tick, plus the follow-up tick a finished job asks for. Gates run beside the tick (verify-gates
 * jobs), and so do Director card turns, triage, steer replies and the brief of a Worker run, so a scenario
 * that reads "tick: merged" or "tick: the card answered" needs the tick that started the job, the drain,
 * and the tick that collects it (its report joins that tick's). A chain of Director jobs (triage, then the
 * brief of the run it unlocks) takes one round each, so it goes on while a tick leaves jobs behind, up to
 * `MAX_ROUNDS`. Use `engine.tick()` directly to look at the in-between state.
 */
const MAX_ROUNDS = 4;

export async function tickToIdle(
  engine: Engine,
  flush: () => Promise<void>,
  gateJobsStarted: () => number,
): Promise<TickReport> {
  const before = gateJobsStarted();
  const first = await engine.tick();
  if (gateJobsStarted() === before && engine.directorJobsInFlight() === 0) {
    return first;
  }

  let report = first;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    await engine.idle();
    for (let i = 0; i < 20 && engine.gateJobsInFlight() > 0; i++) {
      await flush();
    }

    report = mergeReports(report, await engine.tick());
    if (engine.directorJobsInFlight() === 0) {
      break;
    }
  }

  // Jobs the last tick started are left finished too, so the scenario reads a settled state.
  await engine.idle();

  return report;
}

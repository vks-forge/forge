/**
 * Shared moves for the restart-resume scenarios.
 *
 * Why: every resume scenario starts the same way (one ticket, run-1 live, its harness session
 *   reported as a real driver does, because only a recorded session can be resumed) and reads the
 *   same rows afterwards. Writing it once keeps each scenario a short story of "interrupt,
 *   restart, assert".
 *
 * Exports: FAR, getRun(), liveRun().
 * Depends on: helpers/rig. No IO.
 */

import type { Rig } from '#tests/helpers/rig.js';

export const FAR = '9999-12-31T23:59:59.999Z';

export const getRun = (rig: Rig, id: string) =>
  rig.storage.transaction((tx) => tx.runs.get(id));

/** One ticket with run-1 live and its session recorded, as a real driver reports it. */
export async function liveRun(rig: Rig, session = 'sess-A'): Promise<string> {
  const id = await rig.request('x');
  await rig.tick();
  rig.driver.emit('run-1', { type: 'session', session_ref: session });
  await rig.flush();

  return id;
}

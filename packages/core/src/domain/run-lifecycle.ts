/**
 * Run status transitions, including the `interrupted` state a restart leaves behind.
 *
 * Why: stopping the Forge server must not turn healthy Worker runs into failures (d-0092).
 *   A run that was live at shutdown becomes `interrupted`: it keeps its worktree, harness
 *   session and receipts, and the next start either resumes it (`running` again, under a
 *   new run secret generation) or gives up (`settled`, then retried as a new run). It is
 *   not active (no receipts, no tool calls) and not ended (it has no `ended_at`), so
 *   nothing may treat it as finished. Writing the allowed moves as one table keeps the
 *   engine, both storage adapters and the property tests on the same rules, and makes a
 *   jump such as `interrupted -> success` (which would skip the resume and rewrite history)
 *   a refused write instead of a silent one.
 *
 * Exports: RUN_TRANSITIONS, canTransitionRun(), assertRunTransition().
 * Depends on: schemas/run, shared/errors. No IO.
 */

import type { RunStatus } from '#/schemas/run.js';
import { InvalidInputError } from '#/shared/errors.js';

/** Every way a run ends: the driver's result statuses. */
const RESULTS = [
  'success',
  'refused',
  'max_turns',
  'timeout',
  'error',
  'cancelled',
] as const satisfies readonly RunStatus[];

/** For each status, the statuses it may move to. Terminal statuses move nowhere. */
export const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  starting: ['running', 'interrupted', 'settling', 'settled', ...RESULTS],
  running: ['interrupted', 'settling', 'settled', ...RESULTS],
  settling: ['interrupted', 'settled', ...RESULTS],
  interrupted: ['running', 'settled'],
  settled: [],
  success: [],
  refused: [],
  max_turns: [],
  timeout: [],
  error: [],
  cancelled: [],
};

/** True when a run in `from` may move to `to`. A move to the same status is not a move. */
export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

/** Throws InvalidInputError unless `from -> to` is allowed or a no-op. */
export function assertRunTransition(runId: string, from: RunStatus, to: RunStatus): void {
  if (from !== to && !canTransitionRun(from, to)) {
    throw new InvalidInputError(`run ${runId} cannot go from ${from} to ${to}`);
  }
}

/**
 * Prep before checks: keep the tree's packages current when the Worker changed what they come from.
 *
 * Why: a tree is prepared before its Worker starts, but the Worker may then edit the lockfile or a
 *   manifest, and the gates and script checks must judge the code against the packages it asked
 *   for. So each gate run and script job asks the preparer again, off the tick (it already runs in
 *   a job): an unchanged key is a no-op, a changed one installs. If that install fails after the
 *   Worker changed one of the step's input files, the Worker's own edit broke it: that is a failed
 *   `setup` gate with the output tail, sent back like any other finding. A failure with the Worker's
 *   files untouched is not the Worker's doing (the tool vanished, the network is down): it is a
 *   fault the caller retries or parks by error family, never a rework.
 *
 * Exports: SETUP_GATE, prepareForChecks(), setupVerdict(), withPrepared().
 * Depends on: @forge/core (GateVerdict, PrepFailure), types/prep-jobs. IO through the preparer.
 */

import type { GateVerdict, PrepFailure } from '@forge/core';
import type { Preparable } from '#/types/prep-jobs.types.js';

/** The gate name of a setup that failed because of the Worker's change. */
export const SETUP_GATE = 'setup';

/**
 * Brings the tree's packages up to date; null when it is (or there is nothing to prepare), the
 * failing step otherwise. Never throws for a failing step.
 */
export async function prepareForChecks(
  runtime: Preparable,
  worktree: string,
  baseSha: string,
): Promise<PrepFailure | null> {
  const { prepare } = runtime;
  if (!prepare) {
    return null;
  }

  const plan = await prepare.plan(worktree, runtime.config);
  if (plan.steps.length === 0) {
    return null;
  }

  const outcome = await prepare.prepare(worktree, plan, { baseSha });

  return outcome.ok ? null : outcome;
}

/** The verdict of a setup failure: the Worker's change to an input file fails the gate; anything else is an error to retry. */
export function setupVerdict(failure: PrepFailure): GateVerdict {
  const how = failure.timed_out
    ? 'timed out'
    : failure.exit_code === null
      ? 'could not start'
      : `exited with code ${failure.exit_code}`;

  const worker = failure.inputs_changed_by_worker;
  const message = worker
    ? `Setup step "${failure.step}" (${failure.command}) ${how} after your change to the files it installs from. Fix that change.\n${failure.tail}`
    : `Setup step "${failure.step}" (${failure.command}) ${how}.\n${failure.tail}`;

  return {
    status: worker ? 'failed' : 'error',
    findings: [{ check: SETUP_GATE, message }],
    report: `Workspace setup: ${message}`,
  };
}

/**
 * Runs `run` (a script gate or the red proof) once the tree is prepared; a failed setup is its
 * verdict instead. `asError` makes every failure an error: the red proof reads a failed verdict
 * as its own result, so setup must never look like one.
 */
export async function withPrepared(
  runtime: Preparable,
  worktree: string,
  baseSha: string,
  run: () => Promise<GateVerdict>,
  asError = false,
): Promise<GateVerdict> {
  const failure = await prepareForChecks(runtime, worktree, baseSha);
  if (!failure) {
    return run();
  }

  const verdict = setupVerdict(failure);

  return asError ? { ...verdict, status: 'error' } : verdict;
}

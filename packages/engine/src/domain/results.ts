/**
 * Synthesized run results and the run-status mapping.
 *
 * Why: not every run ends with a driver `RunResult`. A harness that crashes, a start that
 *   throws and a server restart all leave the engine to write the ending itself, and the
 *   engine must produce the same shape the settle path already understands, with the
 *   error family that drives retry or park. The mapping from a driver outcome to the
 *   `runs.status` column also lives once, here.
 *
 * Exports: failureResult(), runStatusFor(), familyOf().
 * Depends on: @forge/core (RunResult, RunStatus, ForgeError). No IO.
 */

import { ForgeError } from '@forge/core';
import type { ErrorFamily, RunResult, RunStatus } from '@forge/core';

/** An `error` result with `family` and no usage, for endings the driver never reported. */
export function failureResult(
  family: ErrorFamily,
  session: string | null = null,
): RunResult {
  return {
    status: 'error',
    session,
    usage: { in: 0, out: 0, cachedIn: 0, cacheWrite: 0 },
    costUsd: null,
    filesTouched: [],
    errorFamily: family,
  };
}

/** The family of a thrown value: a ForgeError's own, else `crash` (a harness we could not classify). */
export function familyOf(error: unknown): ErrorFamily {
  return error instanceof ForgeError ? error.errorFamily : 'crash';
}

/** The `runs.status` a driver outcome is stored as; a pause is `settled`, the run itself did not fail. */
export function runStatusFor(result: RunResult): RunStatus {
  return result.status === 'paused' ? 'settled' : result.status;
}

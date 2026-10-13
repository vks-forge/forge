/**
 * Builds the normalized `RunResult` from how a run ended.
 *
 * Why: the Director reads one result per run and routes on `status` and `errorFamily`:
 *   backoff for a rate limit, one retry for a crash, none for a refusal, a human for a
 *   stall. That mapping (the brief's result table) must be identical for both engines and
 *   for failures the driver itself causes (stall, a tool call with no receipt, a user
 *   cancel), so it lives here as one table instead of being re-decided in each engine. The
 *   driver's own verdict overrides the harness's: a run we killed for stalling must read
 *   as `stall` even though its process then exits as a crash. A run that ended normally
 *   but left an `ask_director` interaction open is `paused`, not `success` (the Director
 *   resumes it as a new run when the answer arrives). A `max_turns` run drops its session,
 *   because resuming a session that hit its cap fails again (execution-plane.md section 7).
 *
 * Exports: EFFECTIVE_TABLE, familyOf(), buildRunResult().
 * Depends on: @forge/core (RunResult types), types/claude/run-result. No IO.
 */

import type { ErrorFamily, RunResult, RunResultStatus } from '@forge/core';
import type { Effective, SettleInput } from '#/types/claude/run-result.types.js';

/** The brief's result table: effective end kind to status and error family. */
export const EFFECTIVE_TABLE: Readonly<
  Record<Effective, { status: RunResultStatus; family?: ErrorFamily }>
> = {
  completed: { status: 'success' },
  refused: { status: 'refused', family: 'refusal' },
  max_turns: { status: 'max_turns' },
  budget: { status: 'error', family: 'budget' },
  rate_limit: { status: 'error', family: 'rate_limit' },
  auth: { status: 'error', family: 'auth' },
  cancelled: { status: 'cancelled' },
  policy_denied: { status: 'error', family: 'policy_denied' },
  crash: { status: 'error', family: 'crash' },
  unknown: { status: 'error', family: 'unknown' },
  stall: { status: 'timeout', family: 'stall' },
  turn_timeout: { status: 'timeout', family: 'stall' },
};

/** The error family an end of this kind carries, if any. */
export function familyOf(kind: Effective): ErrorFamily | undefined {
  return EFFECTIVE_TABLE[kind].family;
}

/** Result candidate; the caller parses it with the core `RunResult` schema. */
export function buildRunResult(i: SettleInput): RunResult {
  const kind: Effective = i.override?.kind ?? i.end.kind;
  const row = EFFECTIVE_TABLE[kind];
  const paused = kind === 'completed' && i.pendingAsk !== null;
  const base = {
    session: kind === 'max_turns' ? null : i.session,
    usage: i.usage,
    costUsd: i.costUsd,
    filesTouched: [...i.filesTouched],
  };

  if (paused) {
    return {
      ...base,
      status: 'paused',
      pauseReason: 'interaction',
      interactionId: i.pendingAsk ?? '',
    };
  }

  return {
    ...base,
    status: row.status,
    ...(row.family ? { errorFamily: row.family } : {}),
    ...(kind === 'rate_limit' && i.end.retryNotBefore
      ? { retryNotBefore: i.end.retryNotBefore }
      : {}),
  };
}

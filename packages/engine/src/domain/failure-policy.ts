/**
 * Run-failure policy: retry with backoff, or hand the ticket to a human.
 *
 * Why: a Worker run ends badly all the time (a silent hang, a 429, a crash, a revoked
 *   login). A retry fixes some of those and wastes budget on others: retrying an auth
 *   failure, a refusal or a policy denial changes nothing, and retrying a crash forever is
 *   the re-wake-loop failure this engine exists to avoid (execution-plane.md §8). A merge
 *   conflict is neither: it is re-synced, not parked as policy. The table
 *   is keyed by error family, with attempt caps from config that turn "retry" into "park".
 *
 * Exports: decideFailure().
 * Depends on: types/failure-policy, @forge/core (ErrorFamily). No IO.
 */

import type { ErrorFamily } from '@forge/core';
import type { FailureDecision, FailureInput } from '#/types/failure-policy.types.js';

const NEVER_RETRY: readonly ErrorFamily[] = [
  'auth',
  'policy_denied',
  'refusal',
  'budget',
  'invalid_input',
  // The harness cannot serve this model; retrying the same model cannot help (the fallback list takes over).
  'model_unavailable',
];

const park = (reason: string): FailureDecision => ({ action: 'park', reason });

/** Chooses retry (with the earliest start, epoch ms) or park (with a human-readable reason). */
export function decideFailure(input: FailureInput): FailureDecision {
  const { status, attempts, now, policy } = input;
  if (status === 'max_turns') {
    // A turn limit is a setting, not a fault: another run hits it again, so it is never retried.
    return park(
      `max_turns: the run used all ${input.maxTurns === undefined ? 'its' : input.maxTurns} turns without finishing`,
    );
  }

  if (status === 'refused') {
    return park('refused: the model declined the task');
  }

  if (status === 'cancelled') {
    return park('cancelled: the run was stopped unexpectedly');
  }

  const family: ErrorFamily =
    input.family ?? (status === 'timeout' ? 'stall' : 'unknown');

  // A clash with the base is work for the ticket's writer, not a policy decision: verify syncs the
  // base into the branch again at once; the hourly re-wake cap bounds how often it can repeat.
  if (family === 'merge_conflict') {
    return { action: 'retry', notBefore: now, family };
  }

  if (NEVER_RETRY.includes(family)) {
    return park(`${family}: not retried automatically; needs a human`);
  }

  // The engine parks the harness for a quota error before it asks this table; the answer
  // here is the same wait, so a caller that does ask still gets "retry at the reset".
  if (family === 'quota') {
    const reset =
      input.retryNotBefore === undefined ? NaN : Date.parse(input.retryNotBefore);

    return {
      action: 'retry',
      notBefore: reset > now ? reset : now + policy.rate_limit.max_ms,
      family,
    };
  }

  if (family === 'rate_limit') {
    const cfg = policy.rate_limit;
    if (attempts > cfg.max_attempts) {
      return park(`rate_limit: ${attempts - 1} retries used (max ${cfg.max_attempts})`);
    }

    const reset =
      input.retryNotBefore === undefined ? NaN : Date.parse(input.retryNotBefore);

    const backoff = Math.min(cfg.base_ms * 2 ** (attempts - 1), cfg.max_ms);

    return { action: 'retry', notBefore: reset > now ? reset : now + backoff, family };
  }

  const cfg =
    family === 'crash'
      ? policy.crash
      : family === 'stall'
        ? policy.stall
        : policy.unknown;

  if (attempts > cfg.max_attempts) {
    return park(`${family}: failed ${attempts} times (retry limit ${cfg.max_attempts})`);
  }

  return { action: 'retry', notBefore: now + cfg.delay_ms, family };
}

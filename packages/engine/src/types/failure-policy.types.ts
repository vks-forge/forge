/**
 * Input and output shapes of the run-failure policy.
 *
 * Why: when a run ends badly the engine either schedules a retry or parks the ticket for
 *   a human. The decision is a pure function of the result, how many times this family
 *   already failed and the clock, so it is testable without storage; these types are its
 *   contract (execution-plane.md §8).
 *
 * Exports: FailureInput, FailureDecision.
 * Depends on: @forge/core (ErrorFamily, RetryPolicy, RunResultStatus). Types only.
 */

import type { ErrorFamily, RetryPolicy, RunResultStatus } from '@forge/core';

export interface FailureInput {
  readonly status: RunResultStatus;
  readonly family?: ErrorFamily;
  /** Failed runs of this family for the ticket, including the one being decided. */
  readonly attempts: number;
  /** ISO reset time reported by the harness (rate limit). */
  readonly retryNotBefore?: string;
  /** Epoch ms. */
  readonly now: number;
  readonly policy: RetryPolicy;
  /** The turn limit the run was held to, named in the park reason of a `max_turns` end. */
  readonly maxTurns?: number;
}

export type FailureDecision =
  | { readonly action: 'retry'; readonly notBefore: number; readonly family: ErrorFamily }
  | { readonly action: 'park'; readonly reason: string };

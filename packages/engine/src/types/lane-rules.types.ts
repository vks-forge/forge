/**
 * Input and output shapes of the lane decision rule.
 *
 * Why: the lane decides how much process a ticket gets, and in M0 whether it runs at all.
 *   The rule takes the deterministic pre-check, the model's proposal and the user's hint
 *   and returns one answer plus the tier it implies; naming both sides keeps the engine
 *   and the rule's tests on the same contract (director-core.md §6).
 *
 * Exports: LaneInput, LaneDecision.
 * Depends on: @forge/core (PreCheckResult, TriageOutput, Lane, Tier). Types only.
 */

import type { Lane, PreCheckResult, Tier, TriageOutput } from '@forge/core';

export interface LaneInput {
  /** Pre-check run over the model's predicted files. */
  readonly pre: PreCheckResult;
  readonly llm: TriageOutput;
  readonly hint?: 'quick' | 'full';
  /** Confidence below this moves the lane one up. */
  readonly threshold: number;
  readonly tierCGlobs: readonly string[];
}

export interface LaneDecision {
  readonly lane: Lane;
  readonly tier: Tier;
  /** Why the lane is not just the model's proposal; empty when it is. */
  readonly reasons: readonly string[];
}

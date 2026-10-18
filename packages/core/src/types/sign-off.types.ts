/**
 * Shapes of the sign-off decision.
 *
 * Why: who signs finished work (the Director or the owner) is decided from a handful of plain facts:
 *   the stage's signer setting, the tier of the real diff, the Director's own ceiling, whether the
 *   checks passed outright, whether the Director check passed, how many owner overrides stand and
 *   whether the Director's step errored. Naming them keeps the rule a pure function the engine, the
 *   sign-off card and the property tests all read the same way.
 *
 * Exports: SignOffInput, SignOffDecision.
 * Depends on: nothing. Types only.
 */

export interface SignOffInput {
  /** The stage's setting: `director_or_owner` lets the Director sign when it may, `owner` never. */
  readonly signer: 'director_or_owner' | 'owner';
  /** The tier computed from the real diff. */
  readonly tier: 'A' | 'B' | 'C';
  /** The Director's own ceiling (company setting, a project may only lower it); C is not a value. */
  readonly maxTier: 'none' | 'A' | 'B';
  /** Every check of this cycle (gates, reviewer, critic, scripts) passed outright. */
  readonly checksPassed: boolean;
  /** The Director's check against the plan passed, with no override (a skipped check is false). */
  readonly checkPassed: boolean;
  /** How many owner overrides (merge anyway, continue) the ticket's passing rows carry. */
  readonly overrides: number;
  /** The Director's check step errored. */
  readonly stepError: boolean;
}

export interface SignOffDecision {
  readonly by: 'director' | 'owner';
  readonly reason: string;
}

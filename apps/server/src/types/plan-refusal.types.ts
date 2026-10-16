/**
 * The shape of a planning door's non-success outcome, as the HTTP mapping reads it.
 *
 * Why: the engine's doors each return their own closed union, but every refusal carries a
 *   `status` and at most a reason, a ticket key and its dependents. The route layer maps them
 *   by status alone, so it reads this one structural shape instead of nine unions.
 *
 * Exports: PlanOutcome.
 * Depends on: nothing. Types only.
 */

/** The outcome shape every planning door shares when it did not succeed. */
export interface PlanOutcome {
  readonly status: string;
  readonly reason?: string;
  readonly key?: string;
  readonly dependents?: readonly string[];
}

/**
 * Per-call extras of a Director step.
 *
 * Why: ticket steps run with the model matrix and the engine's step budget alone, but a card
 *   planning step reads code and writes plans, so it needs its own timeout (set per step in the
 *   Director settings) and a way to report what the call cost so the card can count its Director
 *   spend (d-0143). Both are optional, so the older steps are unchanged.
 *
 * Exports: StepExtras.
 * Depends on: none. Types only.
 */

export interface StepExtras {
  /** How long this call may run before it is stopped; the adapter's default when absent. */
  readonly timeoutMs?: number;
  /** Budget of this call in dollars; the engine's `step_budget_usd` when absent (a research call has its own cap). */
  readonly budgetUsd?: number;
  /** Called with the dollars the call cost when the model reports it. */
  readonly onCost?: (usd: number) => void;
}

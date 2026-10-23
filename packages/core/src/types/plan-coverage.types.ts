/**
 * Input and output shapes of the plan coverage check.
 *
 * Why: before a new plan cancels tickets, someone must be able to see which of them the plan
 *   no longer mentions. The cancelled ticket is described by plain facts so the check stays pure.
 *
 * Exports: CancelledTicketFacts.
 * Depends on: nothing. Types only.
 */

/** A ticket a plan approval would cancel, with what its own plan entry (or body) said. */
export interface CancelledTicketFacts {
  readonly id: string;
  readonly title: string;
  /** The plan key it was made from, when the approval record has one. */
  readonly planKey?: string | undefined;
  /** Files its plan entry named; empty when it has no plan entry. */
  readonly files: readonly string[];
  /** Acceptance items of its plan entry; empty when it has no plan entry. */
  readonly acceptance: readonly string[];
}

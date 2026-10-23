/**
 * Director spend types: what the engine says about one Director step when it records its cost.
 *
 * Why: every Director step (planning, chat, escalation answers, sign-off checks) records its dollars
 *   through one door. The caller says what the step was (kind), which ticket it was about and which
 *   model ran it, and whether the harness reported a price at all, so the ledger row is honest about
 *   a step that ran without a price.
 *
 * Exports: SpendMeta.
 * Depends on: nothing. Types only.
 */

/** What a Director step is, for the ledger row: its kind, the ticket it was about and the model that ran it. */
export interface SpendMeta {
  readonly kind: string;
  readonly ticketId?: string | undefined;
  readonly model?: string | undefined;
  /** False when the step ran but the harness reported no price; the row counts as a step, with no dollars. */
  readonly recorded?: boolean;
}

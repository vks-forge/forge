/**
 * Action consequences schemas — what Re-plan, Cancel ticket and Merge anyway would change, read
 * before the owner confirms.
 *
 * Why: these three buttons reach beyond the ticket they sit on (a plan replaces tickets, a cancel
 *   deletes a branch and closes a pull request, an override sends held work toward a merge that
 *   cannot be undone). A generic "are you sure?" does not tell the owner which tickets are
 *   affected, so the server reads the live state and answers with the actual list; the UI words
 *   it. One discriminated union by `action` keeps the three answers apart and typed on both sides.
 *
 * Exports: ConsequenceAction, TicketRef, KeptTicketRef, StopSummary, MechanicalStop,
 *   ReplanConsequences, CancelConsequences, OverruledCheck, MergeAnywayConsequences,
 *   ActionConsequences.
 * Depends on: schemas/ids, schemas/pipeline, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { CardId, TicketId } from '#/schemas/ids.js';
import { Severity } from '#/schemas/pipeline.js';
import { TicketStatus } from '#/schemas/ticket.js';

export const ConsequenceAction = z.enum(['replan', 'cancel', 'merge_anyway']);
export type ConsequenceAction = z.infer<typeof ConsequenceAction>;

export const TicketRef = z.object({ id: TicketId, title: z.string() });
export type TicketRef = z.infer<typeof TicketRef>;

/** A ticket a plan leaves alone, with where it stands (running, waiting for review, done). */
export const KeptTicketRef = TicketRef.extend({ status: TicketStatus });
export type KeptTicketRef = z.infer<typeof KeptTicketRef>;

/** Why the ticket stopped, as the Director will be told. */
export const StopSummary = z.object({
  /** The failure cause, decision cause or setup type, as stored. */
  cause: z.string(),
  summary: z.string(),
  /** How many findings travel with the stop. */
  findings: z.number().int().nonnegative(),
});
export type StopSummary = z.infer<typeof StopSummary>;

/** A stop that fixing in place cures: re-planning would be the expensive way. */
export const MechanicalStop = z.object({
  kind: z.enum(['setup', 'lockfile', 'generated']),
});
export type MechanicalStop = z.infer<typeof MechanicalStop>;

export const ReplanConsequences = z.object({
  action: z.literal('replan'),
  ticket: TicketRef,
  /** The card the Director re-plans; null when the ticket has none (re-plan is then not offered). */
  card_id: CardId.nullable(),
  /** The stopped ticket itself is parked now and replaced when the new plan is approved. */
  ticket_replaced: z.boolean(),
  /** Other tickets that have not started: held, and replaced when the new plan is approved. */
  held: z.array(TicketRef),
  /** Tickets the new plan never cancels: running, waiting on someone, or done. */
  kept: z.array(KeptTicketRef),
  stop: StopSummary.nullable(),
  mechanical: MechanicalStop.nullable(),
});
export type ReplanConsequences = z.infer<typeof ReplanConsequences>;

export const CancelConsequences = z.object({
  action: z.literal('cancel'),
  ticket: TicketRef,
  /** A Worker is running now and will be stopped. */
  run_active: z.boolean(),
  branch: z.string().nullable(),
  has_worktree: z.boolean(),
  pr_number: z.number().int().positive().nullable(),
  /** Open tickets that wait on this one: a plain cancel is refused, Cancel all stops them too. */
  dependents: z.array(TicketRef),
});
export type CancelConsequences = z.infer<typeof CancelConsequences>;

/** One check the owner would overrule, with the worst of what it found. */
export const OverruledCheck = z.object({
  stage_label: z.string(),
  summary: z.string(),
  counts: z.partialRecord(Severity, z.number().int().nonnegative()),
  findings: z.array(
    z.object({ severity: Severity, where: z.string().nullable(), issue: z.string() }),
  ),
});
export type OverruledCheck = z.infer<typeof OverruledCheck>;

export const MergeAnywayConsequences = z.object({
  action: z.literal('merge_anyway'),
  ticket: TicketRef,
  overruled: z.array(OverruledCheck),
  branch: z.string().nullable(),
  pr_number: z.number().int().positive().nullable(),
});
export type MergeAnywayConsequences = z.infer<typeof MergeAnywayConsequences>;

/** `GET /tickets/:id/consequences?action=...`. */
export const ActionConsequences = z.discriminatedUnion('action', [
  ReplanConsequences,
  CancelConsequences,
  MergeAnywayConsequences,
]);
export type ActionConsequences = z.infer<typeof ActionConsequences>;

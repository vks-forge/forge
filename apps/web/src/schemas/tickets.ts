/**
 * Response schemas for the ticket endpoints and the intake and answer replies.
 *
 * Why: the Board and the Ticket page show what the server says about work in flight, so a
 *   server and UI that disagree must fail at the boundary with a named field, not as a blank
 *   card. `TicketDetail` mirrors apps/server `routes/tickets.ts` (one ticket with its runs,
 *   gate results, pending questions and escalations, the scheduler's reason for waiting and the review facts of finished work) and is built from
 *   core's own row schemas, so a column added there reaches the UI with no edit here. The
 *   list page is core's `TicketListPage` itself. `IngestReply` mirrors the engine's
 *   `IngestResult` returned by `POST /intake`; `AnswerReply` is the body of
 *   `POST /interactions/:id/answer`.
 *
 * Exports: TicketDetail (with `can_cancel`, `dependents` and `open_blockers`), TicketEditReply, IngestReply, AnswerReply, SteerReply (schemas and inferred types).
 * Depends on: @forge/core (Ticket, Run, GateResult, Interaction, EscalationView), zod.
 */

import {
  EscalationAction,
  EscalationView,
  GateResult,
  Interaction,
  NeedsYouItem,
  Run,
  Ticket,
  TicketCost,
  TicketReview,
  TicketWait,
} from '@forge/core';
import { z } from 'zod';

export const TicketDetail = z.object({
  ticket: Ticket,
  runs: z.array(Run),
  gate_results: z.array(GateResult),
  /** Only the pending ones; answered questions are history. */
  interactions: z.array(Interaction),
  /** Why a ticket that has not started is held back; null when nothing holds it. */
  wait_reason: z.string().nullable(),
  /** Where the ticket really is and why, in plain words; absent from a server that predates it. */
  wait: TicketWait.nullable().optional(),
  /** Every pending escalation of the ticket, any stage; empty from a server that predates them. */
  escalations: z.array(EscalationView).default([]),
  /** What the owner can do about a wait that has no question (review, sign-off, scheduler waits). */
  wait_actions: z.array(EscalationAction).default([]),
  /** What waits on the owner now, as dock items (d-0172); empty from a server that predates them. */
  needs_you_detail: z.array(NeedsYouItem).default([]),
  /** The diff stat and gated commit of finished work (review or sign-off); null for any other ticket. */
  review: TicketReview.nullable().default(null),
  /** Recorded run cost, total and per run; absent from a server that predates it. */
  cost: TicketCost.optional(),
  /** True for an unfinished ticket of an open card: the header offers "Cancel ticket…". */
  can_cancel: z.boolean().default(false),
  /** The open tickets that wait on this one, so the cancel dialog names them before it cascades. */
  dependents: z.array(z.string()).default([]),
  /** What this ticket still waits for (the scheduler's rule); absent from a server that predates it. */
  open_blockers: z.array(z.string()).optional(),
});
export type TicketDetail = z.infer<typeof TicketDetail>;

/** `PATCH /tickets/:id`: the ticket after the edit. */
export const TicketEditReply = z.object({ ticket: Ticket });
export type TicketEditReply = z.infer<typeof TicketEditReply>;

export const IngestReply = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ticket_created'), ticketId: z.string().min(1) }),
  z.object({ status: z.literal('card_created'), cardId: z.string().min(1) }),
  z.object({ status: z.literal('duplicate') }),
  z.object({ status: z.literal('reply_queued'), ticketId: z.string().min(1) }),
  z.object({ status: z.literal('answered'), interactionId: z.string().min(1) }),
  z.object({ status: z.literal('ignored'), reason: z.string() }),
]);
export type IngestReply = z.infer<typeof IngestReply>;

export const AnswerReply = z.object({
  id: z.string().min(1),
  status: z.literal('answered'),
  /** What happens to the ticket now, in plain words. */
  next: z.string().min(1).optional(),
});
export type AnswerReply = z.infer<typeof AnswerReply>;

/** Body of `POST /runs/:id/steer`: the engine stored the message and the driver took it. */
export const SteerReply = z.object({
  run_id: z.string().min(1),
  inbox_seq: z.number().int().nonnegative(),
  mode: z.string(),
  status: z.literal('delivered'),
});
export type SteerReply = z.infer<typeof SteerReply>;

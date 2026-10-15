/**
 * Response schemas for the ticket endpoints and the intake and answer replies.
 *
 * Why: the Board and the Ticket page show what the server says about work in flight, so a
 *   server and UI that disagree must fail at the boundary with a named field, not as a blank
 *   card. `TicketDetail` mirrors apps/server `routes/tickets.ts` (one ticket with its runs,
 *   gate results, pending questions and the scheduler's reason for waiting) and is built from
 *   core's own row schemas, so a column added there reaches the UI with no edit here. The
 *   list page is core's `TicketListPage` itself. `IngestReply` mirrors the engine's
 *   `IngestResult` returned by `POST /intake`; `AnswerReply` is the body of
 *   `POST /interactions/:id/answer`.
 *
 * Exports: TicketDetail, IngestReply, AnswerReply, SteerReply (schemas and inferred types).
 * Depends on: @forge/core (Ticket, Run, GateResult, Interaction), zod.
 */

import { GateResult, Interaction, Run, Ticket } from '@forge/core';
import { z } from 'zod';

export const TicketDetail = z.object({
  ticket: Ticket,
  runs: z.array(Run),
  gate_results: z.array(GateResult),
  /** Only the pending ones; answered questions are history. */
  interactions: z.array(Interaction),
  /** Why a ticket that has not started is held back; null when nothing holds it. */
  wait_reason: z.string().nullable(),
});
export type TicketDetail = z.infer<typeof TicketDetail>;

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

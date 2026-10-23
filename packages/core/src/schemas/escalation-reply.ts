/**
 * Escalation act replies — what the owner is told after acting on a wait.
 *
 * Why: after "Send back for rework" or "Re-plan" the owner needs to know at once what happens
 *   to the ticket (queued behind which ticket, waiting for the new plan), not discover it on
 *   the board later. Each act reply carries `next`, the plain line from the same derivation
 *   the board's wait line uses.
 *
 * Exports: EscalationActReply, TicketActReply.
 * Depends on: schemas/escalation, schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { EscalationAction, EscalationView } from '#/schemas/escalation.js';
import { TicketId } from '#/schemas/ids.js';

/** What happens now to the ticket, in plain words (absent when the engine could not say). */
const Next = z.string().min(1).optional();

/** The reply of `POST /interactions/:id/act`: the escalation as it stands after the action. */
export const EscalationActReply = z.object({ escalation: EscalationView, next: Next });
export type EscalationActReply = z.infer<typeof EscalationActReply>;

/** The reply of `POST /tickets/:id/act`: which ticket was acted on and with what (the waits it settles have no interaction to return). */
export const TicketActReply = z.object({
  ticket_id: TicketId,
  action: EscalationAction,
  next: Next,
});
export type TicketActReply = z.infer<typeof TicketActReply>;

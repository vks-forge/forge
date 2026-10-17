/**
 * The escalations resource of the ForgeApi port.
 *
 * Why: a ticket that waits on the owner is one escalation, and it is read and acted on from three
 *   screens. Naming the calls once lets the http adapter, the hooks and the tests agree on them:
 *   list a card's escalations (pending first, then the recent settled ones), act on one by
 *   interaction id, and act on a ticket's own wait (review, sign-off, scheduler waits) where no
 *   question exists. A refusal keeps the server's error code (`not_pending`, `stale`,
 *   `still_broken`, `ticket_has_dependents`) so the caller can say why in words.
 *
 * Exports: EscalationsApi.
 * Depends on: schemas/escalation, types/api.types (types only).
 */

import type {
  EscalationActBody,
  EscalationActReply,
  EscalationList,
  TicketActReply,
} from '#/schemas/escalation.js';
import type { RequestOptions } from '#/types/api.types.js';

export interface EscalationsApi {
  /** A card's escalations, pending first, then the last settled ones. */
  forCard(cardId: string, options?: RequestOptions): Promise<EscalationList>;
  /** Acts on one escalation; refused with 409 when it is no longer pending. */
  act(interactionId: string, body: EscalationActBody): Promise<EscalationActReply>;
  /** Acts on a ticket's own wait, one with no pending interaction (review, sign-off, waits). */
  actOnTicket(ticketId: string, body: EscalationActBody): Promise<TicketActReply>;
}

/**
 * Inputs of the card column rollup.
 *
 * Why: the rollup reads only a ticket's id and status and a question's ticket, status and stage, so
 *   callers can pass full rows, summaries or test stubs without building whole tickets. Naming
 *   the narrow shapes keeps that contract visible.
 *
 * Exports: RolledTicket, RolledInteraction, RolledCard.
 * Depends on: schemas/card, schemas/ticket, schemas/interaction. Types only.
 */

import type { Card } from '#/schemas/card.js';
import type { Interaction } from '#/schemas/interaction.js';
import type { Ticket } from '#/schemas/ticket.js';

export type RolledTicket = Pick<Ticket, 'id' | 'status'>;
/** `escalated_at` set means the owner may see the question; unset, the Director is still looking. */
export type RolledInteraction = Pick<
  Interaction,
  'ticket_id' | 'status' | 'escalated_at'
>;
export type RolledCard = Pick<Card, 'phase' | 'needs_you' | 'closed_reason'>;

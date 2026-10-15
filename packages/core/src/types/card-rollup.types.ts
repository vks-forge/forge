/**
 * Inputs of the card column rollup.
 *
 * Why: the rollup reads only a ticket's id and status and a question's ticket and status, so
 *   callers can pass full rows, summaries or test stubs without building whole tickets. Naming
 *   the narrow shapes keeps that contract visible.
 *
 * Exports: RolledTicket, RolledInteraction.
 * Depends on: schemas/ticket, schemas/interaction. Types only.
 */

import type { Interaction } from '#/schemas/interaction.js';
import type { Ticket } from '#/schemas/ticket.js';

export type RolledTicket = Pick<Ticket, 'id' | 'status'>;
export type RolledInteraction = Pick<Interaction, 'ticket_id' | 'status'>;

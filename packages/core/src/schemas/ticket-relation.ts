/**
 * Ticket relation schema — a typed edge between two tickets.
 *
 * Why: which ticket blocks, spawned or supersedes another must have exactly one home, or
 *   a parent link in one place and a blocker list in another would disagree and a ticket
 *   could start while its blocker is still open. `ticket_relations` is that home;
 *   `Ticket.parent` and `Ticket.blocked_by` are only derived views of it. An edge from a
 *   ticket to itself is meaningless and would make it block itself forever, so it is
 *   rejected here (director-core.md §3).
 *
 * Exports: TicketRelation.
 * Depends on: schemas/ids, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { TicketId } from '#/schemas/ids.js';
import { TicketRelationKind } from '#/schemas/ticket.js';

/**
 * The `ticket_relations` row, read as "`from_id` <kind> `to_id`". Derived views:
 * `Ticket.parent` is the `to_id` of a `spawned_from` edge out of the ticket;
 * `Ticket.blocked_by` is the `to_id` of its `depends_on` edges plus the `from_id` of
 * `blocks` edges into it.
 */
export const TicketRelation = z
  .object({
    from_id: TicketId,
    to_id: TicketId,
    kind: TicketRelationKind,
    created_at: z.iso.datetime().optional(),
  })
  .refine((r) => r.from_id !== r.to_id, {
    message: 'a ticket cannot be related to itself',
  });
export type TicketRelation = z.infer<typeof TicketRelation>;

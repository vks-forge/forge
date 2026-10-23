/**
 * Ticket edit body — what the owner (or the card's Director) may change on a ticket.
 *
 * Why: tickets were only ever written by plan approval, so once work was filed or a
 *   plan changed nobody could raise a priority, fix a line of the brief or order one ticket
 *   before another. `PATCH /tickets/:id` and the card chat both send this one shape, so the
 *   two doors accept exactly the same fields. `depends_on` is the ticket's complete set, so a
 *   caller never has to diff, and an empty body is refused because it would be a silent no-op.
 *
 * Exports: TicketEditBody, TICKET_BODY_MAX_CHARS, TICKET_PRIORITY_MIN, TICKET_PRIORITY_MAX.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { TicketId } from '#/schemas/ids.js';

export const TICKET_BODY_MAX_CHARS = 8000;
export const TICKET_PRIORITY_MIN = -100;
export const TICKET_PRIORITY_MAX = 100;

/** `PATCH /tickets/:id`: any of the three fields; `depends_on` replaces the whole set. */
export const TicketEditBody = z
  .strictObject({
    body: z.string().min(1).max(TICKET_BODY_MAX_CHARS).optional(),
    priority: z
      .number()
      .int()
      .min(TICKET_PRIORITY_MIN)
      .max(TICKET_PRIORITY_MAX)
      .optional(),
    depends_on: z.array(TicketId).max(50).optional(),
  })
  .refine(
    (v) => v.body !== undefined || v.priority !== undefined || v.depends_on !== undefined,
    { message: 'send at least one of body, priority, depends_on' },
  );
export type TicketEditBody = z.infer<typeof TicketEditBody>;

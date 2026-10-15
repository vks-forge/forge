/**
 * Card column rollup — which Board column a card is in, from its tickets and questions.
 *
 * Why: the Board must show where a request stands without anyone moving cards by hand
 *   (d-0107). Storing the column would let it drift from the ticket state machine, so it is
 *   computed from the facts: the card's tickets and the questions waiting on the user. One
 *   pure function with a fixed precedence keeps the Board, the Card page, the label mirror
 *   on the source issue and "Needs you" in agreement.
 *
 * Precedence, first match wins:
 *   1. `closed_reason` set -> closed. Closing is a deliberate act on the card, not a derived
 *      fact, and a closed card must not light up Needs you for a question nobody will answer.
 *   2. Needs you: a pending question on one of its tickets, or a ticket waiting on a person
 *      (waiting_human, review, needs_signoff). Wins over everything else.
 *   3. In progress: a ticket that is planned, running, gated or blocked on another ticket.
 *   4. Done: at least one ticket and every ticket not cancelled is done (merged).
 *   5. New: tickets exist and every ticket not cancelled is still in the inbox, untriaged.
 *   6. Shaping: everything else, including a card with no tickets (a Discussion, a Plan not
 *      yet approved) or whose tickets were all cancelled.
 *
 * Exports: rollupCardColumn().
 * Depends on: schemas/card, schemas/ticket, schemas/ticket-summary, types/card-rollup. No IO.
 */

import type { Card, CardColumn } from '#/schemas/card.js';
import type { Ticket } from '#/schemas/ticket.js';
import { NEEDS_YOU_STATUSES } from '#/schemas/ticket-summary.js';
import type { RolledInteraction, RolledTicket } from '#/types/card-rollup.types.js';

const RUNNING_STATUSES: readonly Ticket['status'][] = [
  'planned',
  'in_progress',
  'verifying',
  'blocked',
];

/**
 * The Board column for `card`. `tickets` are the card's own tickets; `pendingInteractions`
 * may hold more than the card's (the whole project's open questions): only those naming one
 * of its tickets and still pending count.
 */
export function rollupCardColumn(
  card: Pick<Card, 'closed_reason'>,
  tickets: readonly RolledTicket[],
  pendingInteractions: readonly RolledInteraction[],
): CardColumn {
  if (card.closed_reason !== undefined) {
    return 'closed';
  }

  const ids = new Set<string>(tickets.map((t) => t.id));
  const asked = pendingInteractions.some(
    (i) => i.status === 'pending' && ids.has(i.ticket_id),
  );

  if (asked || tickets.some((t) => NEEDS_YOU_STATUSES.includes(t.status))) {
    return 'needs_you';
  }

  if (tickets.some((t) => RUNNING_STATUSES.includes(t.status))) {
    return 'in_progress';
  }

  const live = tickets.filter((t) => t.status !== 'cancelled');
  if (live.length > 0 && live.every((t) => t.status === 'done')) {
    return 'done';
  }

  if (live.length > 0 && live.every((t) => t.status === 'inbox')) {
    return 'new';
  }

  return 'shaping';
}

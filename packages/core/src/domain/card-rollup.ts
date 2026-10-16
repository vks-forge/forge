/**
 * Card column rollup — which Board column a card is in, from its phase and what waits on the owner.
 *
 * Why: the Board must show where a request stands without anyone moving cards by hand
 *   (d-0107, d-0139). The phase is stored and moved only by `transitionCard()`; the column
 *   and the "needs you" overlay are computed from it, so the Board, the Card page, the
 *   Inbox and the label mirror on the source issue agree. A card needs the owner when the
 *   card itself waits (its stored flag), or when one of its tickets waits on a person or
 *   has a pending question; that overlay wins over every phase but closed, so an owner's
 *   answer is never hidden behind "In progress". One pure function with a fixed precedence.
 *
 * Precedence, first match wins:
 *   1. Closed: phase `closed`, or `closed_reason` set.
 *   2. Needs you: `cardNeedsYou()` is true.
 *   3. By phase: grilling, verifying, plan_ready -> shaping; approved, queued -> queued;
 *      in_progress -> in_progress; done -> done.
 *
 * Exports: cardNeedsYou(), rollupCardColumn().
 * Depends on: schemas/card, schemas/ticket, schemas/ticket-summary, types/card-rollup. No IO.
 */

import type { Card, CardColumn } from '#/schemas/card.js';
import { NEEDS_YOU_STATUSES } from '#/schemas/ticket-summary.js';
import type {
  RolledCard,
  RolledInteraction,
  RolledTicket,
} from '#/types/card-rollup.types.js';

/**
 * Whether the card waits on the owner: its own flag, a ticket in a waiting status, or a
 * pending question. `pendingInteractions` may hold the whole project's questions: only those
 * naming one of the card's tickets and still pending count.
 */
export function cardNeedsYou(
  card: Pick<Card, 'needs_you'>,
  tickets: readonly RolledTicket[],
  pendingInteractions: readonly RolledInteraction[],
): boolean {
  if (card.needs_you) {
    return true;
  }

  const ids = new Set<string>(tickets.map((t) => t.id));

  return (
    tickets.some((t) => NEEDS_YOU_STATUSES.includes(t.status)) ||
    pendingInteractions.some((i) => i.status === 'pending' && ids.has(i.ticket_id))
  );
}

/** The Board column for `card`; see the precedence above. */
export function rollupCardColumn(
  card: RolledCard,
  tickets: readonly RolledTicket[],
  pendingInteractions: readonly RolledInteraction[],
): CardColumn {
  if (card.phase === 'closed' || card.closed_reason !== undefined) {
    return 'closed';
  }

  if (cardNeedsYou(card, tickets, pendingInteractions)) {
    return 'needs_you';
  }

  switch (card.phase) {
    case 'approved':
    case 'queued':
      return 'queued';
    case 'in_progress':
      return 'in_progress';
    case 'done':
      return 'done';
    case 'grilling':
    case 'verifying':
    case 'plan_ready':
      return 'shaping';
  }
}

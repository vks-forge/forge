/**
 * Board columns: which ticket states share a column, and how a list of tickets is filtered and
 * grouped into them.
 *
 * Why: a user opens the Board to answer "what needs me, what is moving, what is finished".
 *   Ten states would bury that, so they collapse into six columns. Everything that waits on a
 *   person (`waiting_human`, `blocked`, `review`, `needs_signoff`; core's NEEDS_YOU_STATUSES)
 *   shares one amber column so it is never missed: a ticket that stopped (a question nobody
 *   answered, a failure) waits on a person to retry, re-plan or cancel it, so it is not tucked
 *   away with the cancelled ones. Each state belongs to exactly one column, so a ticket can never
 *   be missing or shown twice (a `waiting_human` ticket with no open owner item goes to the first
 *   column instead, see columnOfTicket). Order within a column is the server's (newest change first).
 *
 * Exports: BOARD_COLUMNS, columnOf(), columnOfTicket(), STATE_LABEL, filterTickets(), groupByColumn(), EMPTY_FILTER, isFilterActive(), columnOfTicket().
 * Depends on: @forge/core (TicketSummary, TicketStatus), types/board.types. No IO.
 */

import type { TicketStatus, TicketSummary } from '@forge/core';
import type { BoardColumn, BoardColumnId, BoardFilter } from '#/types/board.types.js';

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    id: 'queue',
    title: 'Inbox and planned',
    hint: 'Waiting to start',
    states: ['inbox', 'planned'],
    tone: 'neutral',
  },
  {
    id: 'active',
    title: 'In progress',
    hint: 'A Worker is on it',
    states: ['in_progress'],
    tone: 'signal',
  },
  {
    id: 'needs_you',
    title: 'Needs you',
    hint: 'A question, a stopped ticket, a review or a sign-off',
    states: ['waiting_human', 'blocked', 'review', 'needs_signoff'],
    tone: 'attn',
  },
  {
    id: 'verifying',
    title: 'Verifying',
    hint: 'Gates are checking it',
    states: ['verifying'],
    tone: 'neutral',
  },
  {
    id: 'done',
    title: 'Done',
    hint: 'Merged and finished',
    states: ['done'],
    tone: 'good',
  },
  {
    id: 'closed',
    title: 'Cancelled',
    hint: 'Stopped for good',
    states: ['cancelled'],
    tone: 'muted',
  },
];

/** The words a person uses for each state. */
export const STATE_LABEL: Readonly<Record<TicketStatus, string>> = {
  inbox: 'Inbox',
  planned: 'Planned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  waiting_human: 'Waiting for you',
  verifying: 'Verifying',
  review: 'In review',
  needs_signoff: 'Needs sign-off',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const EMPTY_FILTER: BoardFilter = { lane: 'all', state: 'all', query: '' };

/** True when any part of the filter narrows the list. */
export function isFilterActive(filter: BoardFilter): boolean {
  return (
    filter.lane !== EMPTY_FILTER.lane ||
    filter.state !== EMPTY_FILTER.state ||
    filter.query.trim() !== ''
  );
}

const COLUMN_OF = new Map<TicketStatus, BoardColumnId>(
  BOARD_COLUMNS.flatMap((column) =>
    column.states.map((state): [TicketStatus, BoardColumnId] => [state, column.id]),
  ),
);

/** The column a state is drawn in. */
export function columnOf(state: TicketStatus): BoardColumnId {
  const id = COLUMN_OF.get(state);
  if (id === undefined) {
    throw new Error(`Ticket state ${state} has no board column.`);
  }

  return id;
}

/**
 * The column a ticket is drawn in. A `waiting_human` ticket with no open owner item (the owner
 * already answered and the card re-plans, or it is stuck) is not waiting on the owner, so it sits
 * with the tickets waiting to start, where its phase chip says why; the server's `needs_you` flag
 * decides, never the status alone.
 */
export function columnOfTicket(ticket: TicketSummary): BoardColumnId {
  return ticket.state === 'waiting_human' && !ticket.needs_you
    ? 'queue'
    : columnOf(ticket.state);
}

/** Keeps the tickets matching every part of the filter. */
export function filterTickets(
  tickets: readonly TicketSummary[],
  filter: BoardFilter,
): readonly TicketSummary[] {
  const query = filter.query.trim().toLowerCase();

  return tickets.filter(
    (ticket) =>
      (filter.lane === 'all' || ticket.lane === filter.lane) &&
      (filter.state === 'all' || ticket.state === filter.state) &&
      (query === '' ||
        ticket.id.toLowerCase().includes(query) ||
        ticket.title.toLowerCase().includes(query)),
  );
}

/** Splits tickets into columns, keeping the given order inside each. Every column is present. */
export function groupByColumn(
  tickets: readonly TicketSummary[],
): Readonly<Record<BoardColumnId, readonly TicketSummary[]>> {
  const groups: Record<BoardColumnId, TicketSummary[]> = {
    queue: [],
    active: [],
    needs_you: [],
    verifying: [],
    done: [],
    closed: [],
  };

  for (const ticket of tickets) {
    groups[columnOfTicket(ticket)].push(ticket);
  }

  return groups;
}

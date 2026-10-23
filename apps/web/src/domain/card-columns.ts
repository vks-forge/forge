/**
 * Card columns: the six Board columns for cards, and how cards are filtered and grouped.
 *
 * Why: the Board's Cards view answers "what needs me, what is moving, what is finished" for
 *   requests rather than tickets. The server rolls each card's column up from its tickets and
 *   pending questions and its phase (d-0107, d-0139), so the UI never decides a column; it only
 *   groups by the one the server sent, which also means a card can never sit in two columns or
 *   none. There is no New column: the Director starts on a card at once, so it lands in Shaping.
 *   A card's column is never moved by hand, so there is nothing here for dragging. Amber stays
 *   with Needs you.
 *
 * Exports: CARD_BOARD_COLUMNS, COLUMN_LABEL, EMPTY_CARD_FILTER, isCardFilterActive(),
 *   filterCards(), groupCards(), firstFilledColumn().
 * Depends on: schemas/cards (types), types/cards-ui.types. No IO.
 */

import type { CardColumn, CardSummary } from '#/schemas/cards.js';
import type { CardColumnDef, CardFilter } from '#/types/cards-ui.types.js';

export const CARD_BOARD_COLUMNS: readonly CardColumnDef[] = [
  {
    id: 'shaping',
    title: 'Shaping',
    hint: 'The Director is asking, checking and writing the plan',
    tone: 'neutral',
  },
  {
    id: 'needs_you',
    title: 'Needs you',
    hint: 'A question, a review or a sign-off',
    tone: 'attn',
  },
  {
    id: 'queued',
    title: 'Queued',
    hint: 'Approved, waiting for a card it depends on or a free Worker',
    tone: 'neutral',
  },
  { id: 'in_progress', title: 'In progress', hint: 'Workers are on it', tone: 'signal' },
  { id: 'done', title: 'Done', hint: 'All its tickets are finished', tone: 'good' },
  { id: 'closed', title: 'Closed', hint: 'Closed with a reason', tone: 'muted' },
];

export const COLUMN_LABEL: Readonly<Record<CardColumn, string>> = {
  shaping: 'Shaping',
  needs_you: 'Needs you',
  queued: 'Queued',
  in_progress: 'In progress',
  done: 'Done',
  closed: 'Closed',
};

export const EMPTY_CARD_FILTER: CardFilter = { type: 'all', query: '' };

export function isCardFilterActive(filter: CardFilter): boolean {
  return filter.type !== 'all' || filter.query.trim() !== '';
}

/** Cards matching the type and the text (id or title, case-insensitive). */
export function filterCards(
  cards: readonly CardSummary[],
  filter: CardFilter,
): readonly CardSummary[] {
  const needle = filter.query.trim().toLowerCase();

  return cards.filter(
    (card) =>
      (filter.type === 'all' || card.type === filter.type) &&
      (needle === '' ||
        card.id.toLowerCase().includes(needle) ||
        card.title.toLowerCase().includes(needle)),
  );
}

/** Every column present, in the server's order within each. */
export function groupCards(
  cards: readonly CardSummary[],
): Record<CardColumn, readonly CardSummary[]> {
  const groups: Record<CardColumn, CardSummary[]> = {
    shaping: [],
    needs_you: [],
    queued: [],
    in_progress: [],
    done: [],
    closed: [],
  };

  for (const card of cards) {
    groups[card.column].push(card);
  }

  return groups;
}

/**
 * The first column, in Board order, that holds a card; null when every column is empty. A phone
 * shows one column at a time, so the Board opens on this one instead of an empty Shaping.
 */
export function firstFilledColumn(
  groups: Readonly<Record<CardColumn, readonly CardSummary[]>>,
): CardColumn | null {
  return CARD_BOARD_COLUMNS.find((column) => groups[column.id].length > 0)?.id ?? null;
}

/**
 * Card columns: the six Board columns for cards, and how cards are filtered and grouped.
 *
 * Why: the Board's Cards view answers "what needs me, what is moving, what is finished" for
 *   requests rather than tickets. The server rolls each card's column up from its tickets and
 *   pending questions (d-0107), so the UI never decides a column; it only groups by the one the
 *   server sent, which also means a card can never sit in two columns or none. A card's column
 *   is never moved by hand, so there is nothing here for dragging. Amber stays with Needs you.
 *
 * Exports: CARD_BOARD_COLUMNS, COLUMN_LABEL, EMPTY_CARD_FILTER, isCardFilterActive(),
 *   filterCards(), groupCards().
 * Depends on: @forge/core (CardSummary, CardColumn), types/cards-ui.types. No IO.
 */

import type { CardColumn, CardSummary } from '@forge/core';
import type { CardColumnDef, CardFilter } from '#/types/cards-ui.types.js';

export const CARD_BOARD_COLUMNS: readonly CardColumnDef[] = [
  { id: 'new', title: 'New', hint: 'Just arrived, not looked at', tone: 'neutral' },
  {
    id: 'shaping',
    title: 'Shaping',
    hint: 'Being talked through, no work yet',
    tone: 'neutral',
  },
  {
    id: 'needs_you',
    title: 'Needs you',
    hint: 'A question, a review or a sign-off',
    tone: 'attn',
  },
  { id: 'in_progress', title: 'In progress', hint: 'Workers are on it', tone: 'signal' },
  { id: 'done', title: 'Done', hint: 'All its tickets are finished', tone: 'good' },
  { id: 'closed', title: 'Closed', hint: 'Closed with a reason', tone: 'muted' },
];

export const COLUMN_LABEL: Readonly<Record<CardColumn, string>> = {
  new: 'New',
  shaping: 'Shaping',
  needs_you: 'Needs you',
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
    new: [],
    shaping: [],
    needs_you: [],
    in_progress: [],
    done: [],
    closed: [],
  };

  for (const card of cards) {
    groups[card.column].push(card);
  }

  return groups;
}

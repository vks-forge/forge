/**
 * Priority words: how a card or planned ticket's priority is named and ordered.
 *
 * Why: priority decides what the Director queues first, and it appears on the Board, in the
 *   plan and in the ticket editor. One table keeps the words ("Urgent", not `urgent`) and the
 *   order the same everywhere, so a Picker, a marker and a test never disagree.
 *
 * Exports: PRIORITY_LABEL, PRIORITY_ORDER.
 * Depends on: schemas/cards (type). No IO.
 */

import type { CardPriority } from '#/schemas/cards.js';

export const PRIORITY_LABEL: Readonly<Record<CardPriority, string>> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

/** Lowest to highest, for a Picker. */
export const PRIORITY_ORDER: readonly CardPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
];

/**
 * Shapes of the Board: its columns and the filter above them.
 *
 * Why: the ten ticket states are too many for a board a person scans in a glance, so states
 *   are grouped into a few columns; the grouping and the filter are plain data so the
 *   mapping can be tested without rendering and the UI never decides it ad hoc.
 *
 * Exports: BoardColumnId, ColumnTone, BoardColumn, BoardFilter.
 * Depends on: @forge/core (types). Types only.
 */

import type { Lane, TicketStatus } from '@forge/core';

export type BoardColumnId =
  'queue' | 'active' | 'needs_you' | 'verifying' | 'done' | 'closed';

/** `attn` (amber) is reserved for work that waits on the user. */
export type ColumnTone = 'neutral' | 'signal' | 'attn' | 'good' | 'muted';

export interface BoardColumn {
  readonly id: BoardColumnId;
  readonly title: string;
  /** Said under the title so a column's meaning needs no manual. */
  readonly hint: string;
  readonly states: readonly TicketStatus[];
  readonly tone: ColumnTone;
}

export interface BoardFilter {
  readonly lane: Lane | 'all';
  readonly state: TicketStatus | 'all';
  /** Matches id or title, case-insensitive. */
  readonly query: string;
}

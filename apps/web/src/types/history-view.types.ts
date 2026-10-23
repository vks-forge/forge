/**
 * Shapes of the History tab's view rules.
 *
 * Why: the filters, the day groups and an entry's link are produced by `domain/history-view`
 *   and drawn by `components/history`; naming them once keeps both sides in step.
 *
 * Exports: HistoryFilters, HistoryOrder, HistoryDayGroup, HistoryLink.
 * Depends on: @forge/core (types only).
 */

import type { HistoryEntry } from '@forge/core';

export interface HistoryFilters {
  readonly statusOnly: boolean;
  readonly needsYouOnly: boolean;
}

/** `oldest-first` puts the newest entry at the bottom (the default); `newest-first` reverses. */
export type HistoryOrder = 'oldest-first' | 'newest-first';

export interface HistoryDayGroup {
  /** Local calendar day, stable across renders. */
  readonly key: string;
  /** "Today", "Yesterday" or "Mon 12 Oct". */
  readonly label: string;
  readonly entries: HistoryEntry[];
}

export interface HistoryLink {
  readonly label: string;
  readonly to: string;
}

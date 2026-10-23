/**
 * Optimistic inbox marks: what a list, a page set and the counts look like after one mark.
 *
 * Why: marking an item read or archiving it must feel instant, but the server is the truth.
 *   The screen applies the mark to everything it has cached (every view's pages and the
 *   counts behind the sidebar badge) the moment the user acts, and puts the snapshot back if
 *   the server refuses. Applying a mark here uses core's own view rule (`inInboxView`), so an
 *   archived item leaves "Needs action" exactly as the server would drop it, and the counts
 *   move by the same arithmetic as the server's `inboxCounts()`.
 *
 * Exports: withMark(), undoOf(), applyMarkToPages(), applyMarkToCounts(), findItem().
 * Depends on: @forge/core (inInboxView, types), types/work-api.types. Pure.
 */

import { inInboxView } from '@forge/core';
import type { InboxCounts, InboxItem, InboxPage, InboxView } from '@forge/core';
import type { InboxMarkName } from '#/types/work-api.types.js';

const VIEWS: readonly InboxView[] = [
  'needs_action',
  'notices',
  'unread',
  'all',
  'archived',
];

/** The item after the mark (`archive` does not change read state: they are separate marks). */
export function withMark(item: InboxItem, mark: InboxMarkName): InboxItem {
  switch (mark) {
    case 'read':
      return { ...item, read: true };
    case 'unread':
      return { ...item, read: false };
    case 'archive':
      return { ...item, archived: true };
    case 'unarchive':
      return { ...item, archived: false };
  }
}

/** The mark that reverses `mark`. */
export function undoOf(mark: InboxMarkName): InboxMarkName {
  switch (mark) {
    case 'read':
      return 'unread';
    case 'unread':
      return 'read';
    case 'archive':
      return 'unarchive';
    case 'unarchive':
      return 'archive';
  }
}

/**
 * Pages of one view after the mark: the item is updated in place, or removed when it no
 * longer belongs to `view`. Pages keep their cursors.
 */
export function applyMarkToPages(
  pages: readonly InboxPage[],
  view: InboxView,
  itemId: string,
  mark: InboxMarkName,
): InboxPage[] {
  return pages.map((page) => ({
    ...page,
    items: page.items.flatMap((item) => {
      if (item.id !== itemId) {
        return [item];
      }

      const next = withMark(item, mark);

      return inInboxView(next, view) ? [next] : [];
    }),
  }));
}

/** Counts after the mark, moved by whether the item enters or leaves each view. */
export function applyMarkToCounts(
  counts: InboxCounts,
  item: InboxItem,
  mark: InboxMarkName,
): InboxCounts {
  const next = withMark(item, mark);
  const out = { ...counts };

  for (const view of VIEWS) {
    const delta = Number(inInboxView(next, view)) - Number(inInboxView(item, view));
    out[view] = Math.max(0, out[view] + delta);
  }

  return out;
}

/** Finds an item by id in a set of pages. */
export function findItem(
  pages: readonly InboxPage[],
  itemId: string,
): InboxItem | undefined {
  return pages.flatMap((page) => page.items).find((item) => item.id === itemId);
}

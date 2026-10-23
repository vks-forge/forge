/**
 * Inbox rules — item ids, the resurface rule, the five views and the counts.
 *
 * Why: the Inbox must never hide something that has moved since the person last looked
 *   (d-0116). A read or archive mark records the item's `updated_at` at that moment; once the
 *   source row changes after it, the mark no longer counts and the item is unread and
 *   unarchived again. This is the one place that rule lives, together with which items each
 *   view shows and how a mark is written, so the list, the counts behind the sidebar badge and
 *   the mark endpoints cannot disagree. Pure: the server gathers the source rows and storage
 *   keeps the marks.
 *
 * Exports: inboxItemId(), parseInboxItemId(), applyInboxMarks(), inInboxView(), inboxCounts(),
 *   compareInbox(), markInbox().
 * Depends on: schemas/inbox, types/inbox.types. No IO.
 */

import { INBOX_KINDS } from '#/schemas/inbox.js';
import type {
  InboxCounts,
  InboxItem,
  InboxKind,
  InboxStateRow,
  InboxView,
} from '#/schemas/inbox.js';
import type { InboxCandidate, InboxMark } from '#/types/inbox.types.js';

/** `<kind>:<source id>`; the source id may itself contain colons. */
export function inboxItemId(kind: InboxKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

/** Splits an item id back into kind and source id; null when it is not one. */
export function parseInboxItemId(
  id: string,
): { kind: InboxKind; sourceId: string } | null {
  const at = id.indexOf(':');
  const kind = id.slice(0, at);
  const sourceId = id.slice(at + 1);
  const known = (INBOX_KINDS as readonly string[]).includes(kind);

  return at > 0 && known && sourceId !== ''
    ? { kind: kind as InboxKind, sourceId }
    : null;
}

const holds = (markedAt: string | undefined, itemAt: string | undefined, now: string) =>
  markedAt !== undefined && itemAt !== undefined && now <= itemAt;

/** Adds `read` and `archived`: a mark holds only while the item has not changed since it. */
export function applyInboxMarks(
  candidates: readonly InboxCandidate[],
  marks: readonly InboxStateRow[],
): InboxItem[] {
  const byKey = new Map(marks.map((m) => [inboxItemId(m.kind, m.item_id), m]));

  return candidates.map((c) => {
    const m = byKey.get(c.id);

    return {
      ...c,
      read: holds(m?.read_at, m?.read_item_updated_at, c.updated_at),
      archived: holds(m?.archived_at, m?.archived_item_updated_at, c.updated_at),
    };
  });
}

/** Every view but archived hides archived items; notices are the items that only inform; all is everything not archived. */
export function inInboxView(item: InboxItem, view: InboxView): boolean {
  switch (view) {
    case 'archived':
      return item.archived;
    case 'needs_action':
      return !item.archived && item.needs_action;
    case 'notices':
      return !item.archived && !item.needs_action;
    case 'unread':
      return !item.archived && !item.read;
    case 'all':
      return !item.archived;
  }
}

export function inboxCounts(items: readonly InboxItem[]): InboxCounts {
  const count = (view: InboxView): number =>
    items.filter((i) => inInboxView(i, view)).length;

  return {
    needs_action: count('needs_action'),
    notices: count('notices'),
    unread: count('unread'),
    all: count('all'),
    archived: count('archived'),
  };
}

/** Newest change first, then id descending: a total order the page cursor relies on. */
export function compareInbox(
  a: Pick<InboxItem, 'updated_at' | 'id'>,
  b: Pick<InboxItem, 'updated_at' | 'id'>,
): number {
  if (a.updated_at !== b.updated_at) {
    return a.updated_at < b.updated_at ? 1 : -1;
  }

  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** The row after applying `mark` to `item` at `nowIso`; unmarking clears the pair of fields. */
export function markInbox(
  project: string,
  item: Pick<InboxItem, 'kind' | 'id' | 'updated_at'>,
  previous: InboxStateRow | null,
  mark: InboxMark,
  nowIso: string,
): InboxStateRow {
  const row: InboxStateRow = {
    ...(previous ?? {
      project,
      kind: item.kind,
      item_id: parseInboxItemId(item.id)?.sourceId ?? item.id,
    }),
  };

  if (mark === 'read') {
    row.read_at = nowIso;
    row.read_item_updated_at = item.updated_at;
  } else if (mark === 'unread') {
    delete row.read_at;
    delete row.read_item_updated_at;
  } else if (mark === 'archive') {
    row.archived_at = nowIso;
    row.archived_item_updated_at = item.updated_at;
  } else {
    delete row.archived_at;
    delete row.archived_item_updated_at;
  }

  return row;
}

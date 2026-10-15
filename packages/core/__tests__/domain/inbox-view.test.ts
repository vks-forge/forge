/**
 * Pins the Inbox rules: item ids, the resurface rule, the views and the counts.
 *
 * Why: the Inbox must never hide something that moved since the owner last looked (d-0116).
 *   If a read or archive mark outlived a change of its source, a failed gate or a new question
 *   would stay buried; if the views disagreed with the counts, the sidebar badge would lie.
 *
 * Pins: id round trip, marks expire when updated_at moves past the stamp, view membership,
 *   counts, ordering, and mark/unmark row edits.
 * Depends on: src/domain/inbox-view. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  applyInboxMarks,
  compareInbox,
  inInboxView,
  inboxCounts,
  inboxItemId,
  markInbox,
  parseInboxItemId,
} from '#/domain/inbox-view.js';
import type { InboxCandidate } from '#/types/inbox.types.js';

const T1 = '2026-10-13T00:00:00.000Z';
const T2 = '2026-10-13T01:00:00.000Z';

const candidate = (over: Partial<InboxCandidate> = {}): InboxCandidate => ({
  id: inboxItemId('question', 'int-1'),
  kind: 'question',
  project: 'p',
  title: 't',
  needs_action: true,
  updated_at: T1,
  ...over,
});

describe('inbox item ids', () => {
  it('round-trips a source id that contains colons and slashes', () => {
    const id = inboxItemId('tool_approval', 'claude/1.2:3/Bash');

    expect(parseInboxItemId(id)).toEqual({
      kind: 'tool_approval',
      sourceId: 'claude/1.2:3/Bash',
    });
  });

  it('rejects ids with an unknown kind or no source', () => {
    expect(parseInboxItemId('nope:1')).toBeNull();
    expect(parseInboxItemId('question:')).toBeNull();
    expect(parseInboxItemId('question')).toBeNull();
  });
});

describe('applyInboxMarks', () => {
  const read = {
    project: 'p',
    kind: 'question' as const,
    item_id: 'int-1',
    read_at: T2,
    read_item_updated_at: T1,
    archived_at: T2,
    archived_item_updated_at: T1,
  };

  it('keeps read and archived while the source has not changed', () => {
    const [item] = applyInboxMarks([candidate()], [read]);

    expect(item).toMatchObject({ read: true, archived: true });
  });

  it('resurfaces the item as unread and unarchived when the source changed after the mark', () => {
    const [item] = applyInboxMarks([candidate({ updated_at: T2 })], [read]);

    expect(item).toMatchObject({ read: false, archived: false });
  });

  it('ignores marks of other items', () => {
    const [item] = applyInboxMarks([candidate()], [{ ...read, item_id: 'other' }]);

    expect(item).toMatchObject({ read: false, archived: false });
  });
});

describe('views and counts', () => {
  const items = applyInboxMarks(
    [
      candidate(),
      candidate({
        id: inboxItemId('gate_failed', '1'),
        kind: 'gate_failed',
        needs_action: false,
      }),
      candidate({ id: inboxItemId('question', 'int-2') }),
    ],
    [
      {
        project: 'p',
        kind: 'question',
        item_id: 'int-2',
        archived_at: T2,
        archived_item_updated_at: T1,
      },
      {
        project: 'p',
        kind: 'gate_failed',
        item_id: '1',
        read_at: T2,
        read_item_updated_at: T1,
      },
    ],
  );

  it('puts archived items only in archived, and read ones out of unread', () => {
    expect(items.filter((i) => inInboxView(i, 'archived')).map((i) => i.id)).toEqual([
      'question:int-2',
    ]);

    expect(items.filter((i) => inInboxView(i, 'unread')).map((i) => i.id)).toEqual([
      'question:int-1',
    ]);

    expect(items.filter((i) => inInboxView(i, 'needs_action'))).toHaveLength(1);
  });

  it('counts every view the same way the views filter', () => {
    expect(inboxCounts(items)).toEqual({
      needs_action: 1,
      unread: 1,
      all: 2,
      archived: 1,
    });
  });
});

describe('compareInbox', () => {
  it('orders newest first, then id descending', () => {
    const rows = [
      { id: 'a', updated_at: T1 },
      { id: 'b', updated_at: T2 },
      { id: 'c', updated_at: T1 },
    ].sort(compareInbox);

    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('markInbox', () => {
  const item = { kind: 'question' as const, id: 'question:int-1', updated_at: T1 };

  it('stamps the item updated_at on read and archive, and clears the pair on undo', () => {
    const read = markInbox('p', item, null, 'read', T2);
    const both = markInbox('p', item, read, 'archive', T2);
    const unread = markInbox('p', item, both, 'unread', T2);
    const back = markInbox('p', item, unread, 'unarchive', T2);

    expect(read).toEqual({
      project: 'p',
      kind: 'question',
      item_id: 'int-1',
      read_at: T2,
      read_item_updated_at: T1,
    });

    expect(both.archived_item_updated_at).toBe(T1);
    expect(unread.read_at).toBeUndefined();
    expect(unread.archived_at).toBe(T2);
    expect(back).toEqual({ project: 'p', kind: 'question', item_id: 'int-1' });
  });
});

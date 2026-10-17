/**
 * Pins: which Inbox items count as new, when a desktop notification may fire, how the title
 * prefix is added, replaced and removed, and that damaged saved ids are forgotten.
 *
 * Why: these rules decide whether the owner is told once, never twice, never about archived or
 *   informational items, and never by a desktop popup they did not ask for. A wrong rule means
 *   a flood of toasts or a missed question.
 * Depends on: domain/inbox-notify. Pure.
 */

import type { InboxItem } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  mayNotifyBrowser,
  newInboxItems,
  parseSeenIds,
  titleWithBadge,
} from '#/domain/inbox-notify.js';

function item(id: string, patch: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    kind: 'question',
    project: 'sample-service',
    title: `Item ${id}`,
    needs_action: true,
    updated_at: '2026-10-01T10:00:00.000Z',
    read: false,
    archived: false,
    ...patch,
  };
}

describe('newInboxItems', () => {
  it('returns unseen needs-you items oldest first and skips seen, archived and informational ones', () => {
    const items = [
      item('question:c'),
      item('question:b'),
      item('question:seen'),
      item('question:old', { archived: true }),
      item('ticket_waiting:info', { needs_action: false }),
    ];

    const fresh = newInboxItems(items, new Set(['question:seen']));

    expect(fresh.map((i) => i.id)).toEqual(['question:b', 'question:c']);
  });
});

describe('mayNotifyBrowser', () => {
  it.each([
    [true, true, 'granted', true],
    [false, true, 'granted', false],
    [true, false, 'granted', false],
    [true, true, 'default', false],
    [true, true, 'denied', false],
    [true, true, 'unsupported', false],
  ] as const)(
    'hidden=%s enabled=%s permission=%s -> %s',
    (hidden, enabled, permission, want) => {
      expect(mayNotifyBrowser({ hidden, enabled, permission })).toBe(want);
    },
  );
});

describe('titleWithBadge', () => {
  it('adds one prefix, replaces an old one and clears at zero', () => {
    expect(titleWithBadge('Inbox · Forge', 3)).toBe('(3) Inbox · Forge');
    expect(titleWithBadge('(3) Inbox · Forge', 4)).toBe('(4) Inbox · Forge');
    expect(titleWithBadge('(3) Inbox · Forge', 0)).toBe('Inbox · Forge');
    expect(titleWithBadge('Inbox · Forge', 0)).toBe('Inbox · Forge');
  });
});

describe('parseSeenIds', () => {
  it('reads a list of strings and forgets anything else', () => {
    expect(parseSeenIds('["a","b"]')).toEqual(['a', 'b']);
    expect(parseSeenIds('["a",1]')).toEqual(['a']);
    expect(parseSeenIds('{"a":1}')).toEqual([]);
    expect(parseSeenIds('not json')).toEqual([]);
    expect(parseSeenIds(null)).toEqual([]);
  });
});

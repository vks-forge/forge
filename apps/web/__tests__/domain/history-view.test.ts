/**
 * Pins: the History tab's pure rules. A wait reads in the largest whole unit and says nothing
 * under a minute; long details fold by length or line count; entries group by the reader's local
 * day and reverse as a whole; the two filters combine; and an entry links to its run, question,
 * review or (on a card) its ticket's history.
 *
 * Why: these rules decide what the owner sees first and where one click lands, on two pages. A
 * wrong unit ("waited 48 hours"), a day that splits at the wrong midnight or a link that leaves
 * the project would be wrong on both pages at once.
 * Depends on: domain/history-view.
 */

import type { HistoryEntry } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  entryLink,
  groupByDay,
  isLongDetail,
  matchesFilters,
  waitedWords,
} from '#/domain/history-view.js';

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  at: '2026-10-20T12:00:00.000Z',
  kind: 'note',
  actor: { type: 'director' },
  title: 'Something happened',
  links: {},
  ...over,
});

const TICKET = { kind: 'ticket', id: 'FG-1', slug: 'demo' } as const;
const CARD = { kind: 'card', id: 'FG-C1', slug: 'demo' } as const;

describe('waitedWords', () => {
  it('uses the largest whole unit and stays silent under a minute', () => {
    expect(waitedWords(undefined)).toBeUndefined();
    expect(waitedWords(59_000)).toBeUndefined();
    expect(waitedWords(60_000)).toBe('waited 1 minute');
    expect(waitedWords(5 * 60_000)).toBe('waited 5 minutes');
    expect(waitedWords(3 * 3_600_000)).toBe('waited 3 hours');
    expect(waitedWords(2 * 86_400_000 + 5_000)).toBe('waited 2 days');
  });
});

describe('isLongDetail', () => {
  it('folds past 220 characters or four lines only', () => {
    expect(isLongDetail('short')).toBe(false);
    expect(isLongDetail('x'.repeat(221))).toBe(true);
    expect(isLongDetail('a\nb\nc\nd')).toBe(false);
    expect(isLongDetail('a\nb\nc\nd\ne')).toBe(true);
  });
});

describe('groupByDay', () => {
  const noon = (day: number) => new Date(2026, 9, day, 12, 0, 0).toISOString();
  const now = new Date(2026, 9, 22, 15, 0, 0).getTime();
  const entries = [
    entry({ at: noon(20), title: 'a' }),
    entry({ at: noon(21), title: 'b' }),
    entry({ at: new Date(2026, 9, 21, 13, 0, 0).toISOString(), title: 'c' }),
    entry({ at: noon(22), title: 'd' }),
  ];

  it('groups by local day, oldest first, with Today and Yesterday named', () => {
    const groups = groupByDay(entries, 'oldest-first', now);

    expect(groups.map((g) => g.label)).toEqual([
      expect.stringMatching(/20/),
      'Yesterday',
      'Today',
    ]);

    expect(groups.map((g) => g.entries.map((e) => e.title))).toEqual([
      ['a'],
      ['b', 'c'],
      ['d'],
    ]);
  });

  it('reverses days and the entries inside them for newest first', () => {
    const groups = groupByDay(entries, 'newest-first', now);

    expect(groups.map((g) => g.entries.map((e) => e.title))).toEqual([
      ['d'],
      ['c', 'b'],
      ['a'],
    ]);
  });
});

describe('matchesFilters', () => {
  const none = { statusOnly: false, needsYouOnly: false };

  it('keeps everything with no filter on', () => {
    expect(matchesFilters(entry(), none)).toBe(true);
  });

  it('keeps only state changes for the status filter', () => {
    const on = { ...none, statusOnly: true };

    expect(matchesFilters(entry({ kind: 'state' }), on)).toBe(true);
    expect(matchesFilters(entry({ kind: 'question' }), on)).toBe(false);
  });

  it('keeps questions, answers, moves to a waiting state and the owner merge for Needs you', () => {
    const on = { ...none, needsYouOnly: true };

    expect(matchesFilters(entry({ kind: 'question' }), on)).toBe(true);
    expect(matchesFilters(entry({ kind: 'answer' }), on)).toBe(true);
    expect(matchesFilters(entry({ kind: 'state', to: 'needs_signoff' }), on)).toBe(true);
    expect(matchesFilters(entry({ kind: 'merge', actor: { type: 'owner' } }), on)).toBe(
      true,
    );

    expect(matchesFilters(entry({ kind: 'merge' }), on)).toBe(false);
    expect(matchesFilters(entry({ kind: 'state', to: 'in_progress' }), on)).toBe(false);
  });

  it('requires every filter that is on', () => {
    const both = { statusOnly: true, needsYouOnly: true };

    expect(matchesFilters(entry({ kind: 'state', to: 'needs_signoff' }), both)).toBe(
      true,
    );

    expect(matchesFilters(entry({ kind: 'question' }), both)).toBe(false);
  });
});

describe('entryLink', () => {
  it('prefers the run on a ticket, then the question, then the review', () => {
    expect(
      entryLink(TICKET, entry({ links: { run_id: 'r1', interaction_id: 'i1' } })),
    ).toEqual({
      label: 'Open run',
      to: '/p/demo/tickets/FG-1/conversation?run=r1',
    });

    expect(entryLink(TICKET, entry({ links: { interaction_id: 'i1' } }))?.label).toBe(
      'Open question',
    );

    expect(entryLink(TICKET, entry({ kind: 'merge' }))?.to).toBe(
      '/p/demo/tickets/FG-1/review',
    );

    expect(entryLink(TICKET, entry())).toBeUndefined();
  });

  it('sends a card roll-up line to the ticket history and a card question to the chat', () => {
    expect(entryLink(CARD, entry({ ticket_id: 'FG-3' }))).toEqual({
      label: 'Open FG-3 history',
      to: '/p/demo/tickets/FG-3/history',
    });

    expect(entryLink(CARD, entry({ links: { interaction_id: 'i1' } }))?.to).toBe(
      '/p/demo/cards/FG-C1/conversation',
    );

    expect(entryLink(CARD, entry())).toBeUndefined();
  });
});

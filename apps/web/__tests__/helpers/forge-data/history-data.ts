/**
 * Sample history entries for the History tab tests.
 *
 * Why: the tab groups by the reader's calendar day, so fixed ISO dates would make "Today" and
 *   "Yesterday" depend on when the suite runs. Entries are placed relative to the start of
 *   the local day instead: two days back, yesterday, and early today, which always land in
 *   three different groups. A long detail and a wait are included so the fold and "waited"
 *   words have something to show.
 *
 * Exports: LONG_DETAIL, ticketHistoryEntries(), cardHistoryEntries(), manyEntries(), dayStart().
 * Depends on: @forge/core (types).
 */

import type { HistoryEntry } from '@forge/core';

const HOUR = 3_600_000;

/** Midnight at the start of the local day. */
export function dayStart(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  return date.getTime();
}

export const LONG_DETAIL = 'The reviewer found that zod is missing from package.json. '
  .repeat(6)
  .trim();

const iso = (ms: number): string => new Date(ms).toISOString();

/** A ticket's story across three local days, oldest first. */
export function ticketHistoryEntries(): HistoryEntry[] {
  const start = dayStart();

  return [
    {
      at: iso(start - 36 * HOUR),
      kind: 'state',
      actor: { type: 'director' },
      title: 'Planned for the build lane',
      from: 'inbox',
      to: 'planned',
      links: {},
    },
    {
      at: iso(start - 35 * HOUR),
      kind: 'run',
      actor: { type: 'worker', name: 'builder' },
      title: 'Started working',
      from: 'planned',
      to: 'in_progress',
      links: { run_id: 'run-7' },
      waited_ms: 2 * 24 * HOUR,
    },
    {
      at: iso(start - 12 * HOUR),
      kind: 'question',
      actor: { type: 'worker', name: 'builder' },
      title: 'Asked you: which database should this use?',
      from: 'in_progress',
      to: 'waiting_human',
      links: { interaction_id: 'int-9', run_id: 'run-7' },
    },
    {
      at: iso(start + 1000),
      kind: 'answer',
      actor: { type: 'owner' },
      title: 'You answered: use SQLite',
      from: 'waiting_human',
      to: 'in_progress',
      links: { interaction_id: 'int-9' },
    },
    {
      at: iso(start + 2000),
      kind: 'check',
      actor: { type: 'engine' },
      title: 'Sent back for rework',
      detail: LONG_DETAIL,
      from: 'review',
      to: 'in_progress',
      links: { stage_id: 'stage-3' },
    },
    {
      at: iso(start + 3000),
      kind: 'merge',
      actor: { type: 'owner' },
      title: 'Signed off by you and merged',
      from: 'needs_signoff',
      to: 'done',
      links: {},
    },
  ];
}

/** A card's story: its own phases and roll-up lines that name a ticket. */
export function cardHistoryEntries(): HistoryEntry[] {
  const start = dayStart();

  return [
    {
      at: iso(start - 36 * HOUR),
      kind: 'plan',
      actor: { type: 'director' },
      title: 'Plan ready for your review',
      links: { card_id: 'FG-C9' },
    },
    {
      at: iso(start - 12 * HOUR),
      kind: 'state',
      actor: { type: 'engine' },
      title: 'SVC-1: moved to In progress',
      from: 'planned',
      to: 'in_progress',
      ticket_id: 'SVC-1',
      links: { card_id: 'FG-C9' },
    },
    {
      at: iso(start + 1000),
      kind: 'question',
      actor: { type: 'director' },
      title: 'Asked you which lane to use',
      links: { interaction_id: 'int-3', card_id: 'FG-C9' },
    },
  ];
}

/** `count` plain notes, one per minute from two days back, oldest first, for paging tests. */
export function manyEntries(count: number): HistoryEntry[] {
  const first = dayStart() - 36 * HOUR;

  return Array.from({ length: count }, (_, index) => ({
    at: iso(first + index * 60_000),
    kind: 'note' as const,
    actor: { type: 'director' as const },
    title: `Note ${index + 1}`,
    links: {},
  }));
}

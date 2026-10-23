/**
 * History view rules: filters, day groups, waited words and where an entry links.
 *
 * Why: the History tab shows entries the server already wrote in plain language; what is left
 *   for the browser is arranging them for a reader. Entries group by the reader's calendar day
 *   (a card moved at 23:50 UTC is "Yesterday" for someone in another zone), the list reads
 *   oldest first with the newest at the bottom or reversed on request, two filters cut it to
 *   status changes or to what needed the owner, a wait reads as "waited 2 days", and each
 *   entry points at the run, question, review or ticket it came from. One module keeps the
 *   Ticket and Card tabs agreeing on all of it.
 *
 * Exports: HISTORY_FILTERS, matchesFilters(), groupByDay(), waitedWords(), isLongDetail(),
 *   actorLabel(), entryLink().
 * Depends on: @forge/core (types, NEEDS_YOU_STATUSES), domain/card-paths, domain/ticket-paths,
 *   types/history-view.types. No IO.
 */

import { NEEDS_YOU_STATUSES } from '@forge/core';
import type { HistoryActor, HistoryEntry } from '@forge/core';
import { cardPath } from '#/domain/card-paths.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import type {
  HistoryDayGroup,
  HistoryFilters,
  HistoryLink,
  HistoryOrder,
} from '#/types/history-view.types.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Past this many characters (or lines) a detail is folded behind "Show more". */
const FOLD_CHARS = 220;
const FOLD_LINES = 4;

export const HISTORY_FILTERS: readonly {
  key: keyof HistoryFilters;
  label: string;
}[] = [
  { key: 'statusOnly', label: 'Status changes only' },
  { key: 'needsYouOnly', label: 'Needs you only' },
];

/** What asked for the owner: a question, an answer, a move into a state that waits on them, their own merge. */
function needsOwner(entry: HistoryEntry): boolean {
  return (
    entry.kind === 'question' ||
    entry.kind === 'answer' ||
    (entry.to !== undefined && NEEDS_YOU_STATUSES.includes(entry.to)) ||
    (entry.kind === 'merge' && entry.actor.type === 'owner')
  );
}

/** Both filters on at once narrow further (an entry must pass every filter that is on). */
export function matchesFilters(entry: HistoryEntry, filters: HistoryFilters): boolean {
  if (filters.statusOnly && entry.kind !== 'state') {
    return false;
  }

  return !filters.needsYouOnly || needsOwner(entry);
}

function dayKey(at: number): string {
  const date = new Date(at);

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dayLabel(at: number, now: number): string {
  if (dayKey(at) === dayKey(now)) {
    return 'Today';
  }

  if (dayKey(at) === dayKey(now - DAY)) {
    return 'Yesterday';
  }

  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();

  return new Date(at).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Entries grouped by local day. `entries` arrive oldest first; `newest-first` reverses
 * both the days and the entries inside each day.
 */
export function groupByDay(
  entries: readonly HistoryEntry[],
  order: HistoryOrder,
  now: number,
): HistoryDayGroup[] {
  const groups: HistoryDayGroup[] = [];
  for (const entry of entries) {
    const at = Date.parse(entry.at);
    const key = dayKey(at);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, label: dayLabel(at, now), entries: [entry] });
    }
  }

  if (order === 'oldest-first') {
    return groups;
  }

  return groups.reverse().map((group) => ({
    ...group,
    entries: [...group.entries].reverse(),
  }));
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** "waited 2 days", "waited 3 hours", "waited 5 minutes"; nothing under a minute. */
export function waitedWords(ms: number | undefined): string | undefined {
  if (ms === undefined || ms < MINUTE) {
    return undefined;
  }

  if (ms < HOUR) {
    return `waited ${plural(Math.floor(ms / MINUTE), 'minute')}`;
  }

  if (ms < DAY) {
    return `waited ${plural(Math.floor(ms / HOUR), 'hour')}`;
  }

  return `waited ${plural(Math.floor(ms / DAY), 'day')}`;
}

export function isLongDetail(detail: string): boolean {
  return detail.length > FOLD_CHARS || detail.split('\n').length > FOLD_LINES;
}

/** Who did it, in the owner's words: "You", "Director", "Forge", "Worker (agent name)". */
export function actorLabel(actor: HistoryActor): string {
  switch (actor.type) {
    case 'owner':
      return 'You';
    case 'director':
      return 'Director';
    case 'engine':
      return 'Forge';
    case 'worker':
      return actor.name === undefined ? 'Worker' : `Worker (${actor.name})`;
  }
}

/**
 * Where an entry leads. On a ticket: its run (the Worker's thread), else its question, else the
 * review for a merge or a check. On a card: a roll-up line (it names a ticket) opens that
 * ticket's own history; a card-level question opens the card's conversation.
 */
export function entryLink(
  scope: { kind: 'ticket' | 'card'; id: string; slug: string },
  entry: HistoryEntry,
): HistoryLink | undefined {
  const { slug } = scope;
  if (scope.kind === 'card') {
    if (entry.ticket_id !== undefined) {
      return {
        label: `Open ${entry.ticket_id} history`,
        to: ticketPath(slug, entry.ticket_id, 'history'),
      };
    }

    return entry.links.interaction_id === undefined
      ? undefined
      : { label: 'Open question', to: cardPath(slug, scope.id, 'conversation') };
  }

  const { run_id: runId, interaction_id: interactionId } = entry.links;
  if (runId !== undefined) {
    return { label: 'Open run', to: ticketPath(slug, scope.id, 'conversation', runId) };
  }

  if (interactionId !== undefined) {
    return { label: 'Open question', to: ticketPath(slug, scope.id, 'conversation') };
  }

  return entry.kind === 'merge' || entry.kind === 'check'
    ? { label: 'Open review', to: ticketPath(slug, scope.id, 'review') }
    : undefined;
}

/**
 * What the record page says in words: provenance, links, history lines and the import note.
 *
 * Why: to trust a record the owner needs to know in one line whose word it is ("Your decision"
 *   or "Director's inference, approved by you on 12 Oct"), what it points at, how it got to its
 *   current state and, for a record that came from the old repository, which fields Forge had
 *   to fill in. The server sends codes (`author`, `origin`, `rel`, event names); the wording
 *   lives here, as data, so the screen stays thin and the sentences can be tested. Nothing here
 *   edits anything: a record is never changed, only superseded.
 *
 * Exports: KIND_LABEL, provenanceLine(), linkGroups(), eventLine(), aidVersionLine(),
 *   importNote(), dayOf(), linkHref().
 * Depends on: @forge/core (types), domain/card-paths, domain/ticket-paths, domain/nav-entries,
 *   types/memory-record-copy.types. Pure.
 */

import type {
  MemoryAidVersion,
  MemoryEvent,
  MemoryKind,
  MemoryRecordView,
  MemoryStatus,
} from '@forge/core';
import { cardPath } from '#/domain/card-paths.js';
import { projectPath } from '#/domain/nav-entries.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import type { LinkGroup, LinkTarget } from '#/types/memory-record-copy.types.js';

export const KIND_LABEL: Readonly<Record<MemoryKind, string>> = {
  decision: 'Decision',
  rejected: 'Rejected approach',
  proposal: 'Proposal',
  outcome: 'Outcome',
};

const STATUS_WORD: Readonly<Record<MemoryStatus, string>> = {
  active: 'active',
  superseded: 'superseded',
  pending: 'waiting for you',
  rejected: 'rejected',
};

/** `2026-10-12` from an ISO timestamp or date; anything else is returned as written. */
export function dayOf(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

/** Whose word the record is, in one sentence. */
export function provenanceLine(
  record: Pick<
    MemoryRecordView,
    'author' | 'kind' | 'status' | 'approved_at' | 'rejected_at'
  >,
): string {
  const mine = record.author === 'user';

  if (record.status === 'pending') {
    return "Director's inference, waiting for your answer";
  }

  if (record.kind === 'rejected') {
    if (mine) {
      return 'An approach you ruled out';
    }

    return record.rejected_at
      ? `Director's inference, rejected by you on ${dayOf(record.rejected_at)}`
      : "Director's inference, rejected";
  }

  if (record.kind === 'outcome') {
    return mine ? 'An outcome you recorded' : 'An outcome the Director recorded';
  }

  if (mine) {
    return 'Your decision';
  }

  return record.approved_at
    ? `Director's inference, approved by you on ${dayOf(record.approved_at)}`
    : "Director's inference";
}

const REL_LABEL = {
  amends: 'Amends',
  reopens: 'Reopens',
  cites: 'Cites',
  card: 'Card',
  ticket: 'Ticket',
} as const;

/**
 * The record's forward links grouped by relation, in reading order. `supersedes` is read from
 * the record's own field as well as from `links`, and shown once.
 */
export function linkGroups(
  record: Pick<MemoryRecordView, 'links' | 'supersedes' | 'superseded_by'>,
): LinkGroup[] {
  const groups: LinkGroup[] = [];
  const add = (label: string, items: LinkTarget[]): void => {
    if (items.length > 0) {
      groups.push({ label, items });
    }
  };

  const replaces = new Set<string>(record.supersedes ? [record.supersedes] : []);
  for (const link of record.links) {
    if (link.rel === 'supersedes') {
      replaces.add(link.target);
    }
  }

  add(
    'Replaces',
    [...replaces].map((target) => ({ kind: 'record', target })),
  );

  add(
    'Replaced by',
    record.superseded_by ? [{ kind: 'record', target: record.superseded_by }] : [],
  );

  for (const rel of Object.keys(REL_LABEL) as (keyof typeof REL_LABEL)[]) {
    add(
      REL_LABEL[rel],
      record.links
        .filter((link) => link.rel === rel)
        .map((link) => ({ kind: link.target_kind, target: link.target })),
    );
  }

  return groups;
}

/** Where a link goes inside the project. */
export function linkHref(slug: string, link: LinkTarget): string {
  if (link.kind === 'card') {
    return cardPath(slug, link.target);
  }

  if (link.kind === 'ticket') {
    return ticketPath(slug, link.target);
  }

  return projectPath(slug, `memory/${encodeURIComponent(link.target)}`);
}

const EVENT_WORD: Readonly<Record<MemoryEvent['event'], string>> = {
  imported: 'Imported from the old repository',
  proposed: 'Proposed',
  decided: 'Decided',
  approved: 'Approved',
  rejected: 'Rejected',
  superseded: 'Replaced by a newer decision',
  aids_set: 'Search aids changed',
};

/** What happened, with the state move in brackets; the time and actor sit beside it. */
export function eventLine(event: MemoryEvent): string {
  const move =
    event.from_status !== null && event.to_status !== null
      ? ` (${STATUS_WORD[event.from_status]} to ${STATUS_WORD[event.to_status]})`
      : event.to_status !== null
        ? ` (${STATUS_WORD[event.to_status]})`
        : '';

  return `${EVENT_WORD[event.event]}${move}`;
}

/** One version of the search aids (never provenance), as a line. */
export function aidVersionLine(version: MemoryAidVersion): string {
  const aliases = version.aliases?.split(/\n+/).filter(Boolean) ?? [];
  const bits = [
    version.gist ? `gist “${version.gist}”` : 'no gist',
    aliases.length > 0 ? `aliases ${aliases.join(', ')}` : 'no aliases',
    version.pinned ? 'pinned' : 'not pinned',
  ];

  return bits.join(', ');
}

/** The note on a record that came from the old repository; `at` is the import event's time if known. */
export function importNote(
  imported: NonNullable<MemoryRecordView['imported']>,
  at: string | undefined,
): string {
  const when = at ? ` on ${dayOf(at)}` : '';
  const count = imported.defaulted_fields.length;
  const fields =
    count === 0
      ? 'Nothing was missing.'
      : `${count} field${count === 1 ? ' was' : 's were'} filled with defaults: ${imported.defaulted_fields.join(', ')}.`;

  return `Imported from the old repository${when} (${imported.from}). ${fields}`;
}

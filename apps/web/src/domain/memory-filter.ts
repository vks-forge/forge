/**
 * Memory list rules: which record belongs on which tab, how search narrows it, and what an
 * answer does to a proposal before the server confirms.
 *
 * Why: the owner scans a project's memory to answer one question ("did we decide this?") or to
 *   clear the proposals waiting on them. Tabs, text and tag filters must agree with what the
 *   server will say, and an approved proposal must leave the Proposals tab and appear under
 *   Decisions at once (the id is kept, as the real writer does) so the click feels instant.
 *   These are pure so the optimistic move and its rollback are testable without a screen.
 *
 * Exports: TAB_OF_KIND, tabOf(), filterEntries(), countByTab(), tagsOf(), tagsInUse(), applyAnswer(),
 *   DEFAULT_FILTER.
 * Depends on: @forge/core (types), types/memory.types. No IO.
 */

import type { MemoryKind, MemoryListEntry } from '@forge/core';
import type { MemoryAnswer, MemoryFilter, MemoryTab } from '#/types/memory.types.js';

export const TAB_OF_KIND: Readonly<Record<MemoryKind, MemoryTab>> = {
  decision: 'decisions',
  rejected: 'rejected',
  proposal: 'proposals',
  outcome: 'outcomes',
};

export const DEFAULT_FILTER: MemoryFilter = {
  tab: 'decisions',
  text: '',
  tags: [],
  activeOnly: false,
};

export function tabOf(entry: Pick<MemoryListEntry, 'kind'>): MemoryTab {
  return TAB_OF_KIND[entry.kind];
}

/** Entries on the filter's tab that match its text (id, statement or tag) and every chosen tag. */
export function filterEntries(
  entries: readonly MemoryListEntry[],
  filter: MemoryFilter,
): MemoryListEntry[] {
  const needle = filter.text.trim().toLowerCase();

  return entries.filter((entry) => {
    if (tabOf(entry) !== filter.tab) {
      return false;
    }

    if (filter.activeOnly && entry.status === 'superseded') {
      return false;
    }

    if (!filter.tags.every((tag) => entry.tags.includes(tag))) {
      return false;
    }

    return (
      needle === '' ||
      entry.id.toLowerCase().includes(needle) ||
      entry.statement.toLowerCase().includes(needle) ||
      entry.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
  });
}

export function countByTab(
  entries: readonly MemoryListEntry[],
): Record<MemoryTab, number> {
  const counts: Record<MemoryTab, number> = {
    decisions: 0,
    rejected: 0,
    proposals: 0,
    outcomes: 0,
  };

  for (const entry of entries) {
    counts[tabOf(entry)] += 1;
  }

  return counts;
}

/** Tags used on one tab, most used first, so the filter offers what exists. */
export function tagsOf(entries: readonly MemoryListEntry[], tab: MemoryTab): string[] {
  const uses = new Map<string, number>();
  for (const entry of entries) {
    if (tabOf(entry) === tab) {
      for (const tag of entry.tags) {
        uses.set(tag, (uses.get(tag) ?? 0) + 1);
      }
    }
  }

  return [...uses.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/** Every tag in use across all tabs, most used first: the tag chips of a search. */
export function tagsInUse(entries: readonly MemoryListEntry[]): string[] {
  const uses = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      uses.set(tag, (uses.get(tag) ?? 0) + 1);
    }
  }

  return [...uses.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([tag]) => tag);
}

/** The list as it will look once the server accepts the answer; other entries are untouched. */
export function applyAnswer(
  entries: readonly MemoryListEntry[],
  answer: MemoryAnswer,
): MemoryListEntry[] {
  return entries.map((entry) => {
    if (entry.id !== answer.id || entry.status !== 'pending') {
      return entry;
    }

    return answer.verdict === 'approve'
      ? { ...entry, kind: 'decision', status: 'active' }
      : { ...entry, kind: 'rejected', status: 'rejected' };
  });
}

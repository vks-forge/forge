/**
 * Shared helpers for the memory contract suites: a transaction shortcut, an insert shortcut and a search shortcut.
 *
 * Why: the memory contract is split into several files (records, moves, reads and search, log and purge)
 *   to stay readable, and each needs the same three shortcuts over the adapter under test. Keeping them in
 *   one place means a change to how a test inserts a record or searches is made once.
 *
 * Exports: memoryKit().
 * Depends on: @forge/core, helpers/memory-rows. IO only through the adapter under test.
 */

import { buildMatch, directorScope } from '@forge/core';
import type { MemoryLink, MemoryRow, MemoryScope, StorageAdapter } from '@forge/core';
import { memoryEvent, memoryRow } from '#tests/helpers/memory-rows.js';

export function memoryKit(getDb: () => StorageAdapter) {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  /** Inserts a record (an active decision of `forge` unless `row` says otherwise). */
  const add = (
    row: Partial<MemoryRow> = {},
    tags: string[] = [],
    links: MemoryLink[] = [],
  ): Promise<number> =>
    tx((t) => t.memory.insertRecord(memoryRow(row), tags, links, memoryEvent()));

  const search = (
    match: string,
    scope: MemoryScope = directorScope(),
    project = 'forge',
    limit = 20,
  ) =>
    tx((t) => t.memory.searchLexical({ project, match, scope, limit, snippet: false }));

  const ids = (hits: { id: string }[]): string[] => hits.map((h) => h.id);
  const m = (...terms: string[]): string => buildMatch({ terms, mode: 'and' }) as string;

  return { tx, add, search, ids, m };
}

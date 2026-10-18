/**
 * A fake MemoryIndex for engine tests: records in an array, a naive word-overlap search, every call recorded.
 *
 * Why: the engine reads project memory through the MemoryIndex port and must work with any implementation,
 *   so its tests do not import the memory package. This fake keeps decisions and rejected approaches as plain
 *   records, applies the scope the engine sends (tags, rejected approaches) the way the real index does and
 *   ranks a search by how many of the query words a statement holds. It records the queries and the calls
 *   so a test can assert what the engine asked for: the terms, the scope, and that `rejected()` was read in
 *   full.
 *
 * Exports: FakeMemoryIndex, FakeMemoryRecord, createFakeMemoryIndex().
 * Depends on: @forge/core (MemoryIndex port, scopes, extractTerms). No IO.
 */

import { extractTerms, scopeAdmits } from '@forge/core';
import type { MemoryHit, MemoryIndex, MemoryScope, MemorySearchQuery } from '@forge/core';

export interface FakeMemoryRecord {
  readonly id: string;
  readonly kind: 'decision' | 'rejected';
  readonly statement: string;
  readonly tags?: readonly string[];
  readonly pinned?: boolean;
}

export interface FakeMemoryIndex extends MemoryIndex {
  readonly searches: MemorySearchQuery[];
  readonly rejectedCalls: { limit: number | undefined; scope: MemoryScope | undefined }[];
  /** Tags the digest reports (the project's vocabulary for the rewrite). */
  tags: { tag: string; count: number }[];
}

const wordsOf = (text: string): Set<string> => new Set(extractTerms(text));

export function createFakeMemoryIndex(
  records: readonly FakeMemoryRecord[],
): FakeMemoryIndex {
  const searches: MemorySearchQuery[] = [];
  const rejectedCalls: FakeMemoryIndex['rejectedCalls'] = [];
  const ref = (r: FakeMemoryRecord) => ({
    id: r.id,
    statement: r.statement,
    ...(r.tags && r.tags.length > 0 ? { tags: r.tags } : {}),
  });

  const visible = (scope?: MemoryScope) =>
    records.filter(
      (r) =>
        scope === undefined ||
        scopeAdmits(scope, {
          kind: r.kind,
          status: r.kind === 'decision' ? 'active' : 'rejected',
          tags: r.tags ?? [],
        }),
    );

  const newestFirst = (list: readonly FakeMemoryRecord[]) =>
    [...list].sort((a, b) => (a.id < b.id ? 1 : -1));

  const index: FakeMemoryIndex = {
    searches,
    rejectedCalls,
    tags: [],

    async search(query) {
      searches.push(query);
      const words = new Set([
        ...(query.terms ?? []),
        ...(query.synonyms ?? []),
        ...extractTerms(query.text ?? ''),
      ]);

      const kinds = query.kinds ?? ['decision', 'rejected'];
      const hits = visible(query.scope)
        .filter((r) => kinds.includes(r.kind))
        .map((r) => ({
          r,
          score: [...wordsOf(r.statement)].filter((w) => words.has(w)).length,
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || (a.r.id < b.r.id ? -1 : 1))
        .slice(0, query.k ?? 8)
        .map(({ r, score }): MemoryHit => ({
          id: r.id,
          kind: r.kind,
          status: r.kind === 'decision' ? 'active' : 'rejected',
          line: r.statement.slice(0, 160),
          tags: [...(r.tags ?? [])],
          why: 'statement',
          score,
        }));

      return { hits, total: hits.length, truncated: false };
    },

    async get() {
      return { records: [], missing: [] };
    },

    async related() {
      return null;
    },

    async list() {
      return [];
    },

    async digest(_project, scope) {
      const list = visible(scope);

      return {
        decisions: list.filter((r) => r.kind === 'decision').length,
        rejected: list.filter((r) => r.kind === 'rejected').length,
        proposals: 0,
        pinned: list.filter((r) => r.pinned).length,
        tags: index.tags,
      };
    },

    async rejected(_project, limit, scope) {
      rejectedCalls.push({ limit, scope });
      const list = newestFirst(visible(scope).filter((r) => r.kind === 'rejected'));

      return (limit === undefined ? list : list.slice(0, limit)).map(ref);
    },

    async pinned(_project, limit, scope) {
      return newestFirst(visible(scope).filter((r) => r.kind === 'decision' && r.pinned))
        .slice(0, limit)
        .map(ref);
    },

    async decisions(_project, scope) {
      return newestFirst(visible(scope).filter((r) => r.kind === 'decision')).map(ref);
    },

    async history() {
      return null;
    },
  };

  return index;
}

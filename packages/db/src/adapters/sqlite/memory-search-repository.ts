/**
 * SQLite full-text search over memory records, with the scope applied inside the query.
 *
 * Why: a Worker may only see active decisions of its own slice (and rejected approaches when its agent
 *   asks), so kind, status, tag and project limits are part of the SQL, joined on the record row, never a
 *   filter on a ranked list. The match expression arrives already built from quoted terms (core
 *   `buildMatch`), so no query text reaches the FTS5 syntax raw. Ranking is bm25 with the statement
 *   weighted above the gist, aliases, tags and body; the score is negated so a higher number is a better
 *   match. Snippets mark matched words with control characters, never markup. The scope rule is the SQL
 *   form of core `scopeAdmits` and a test holds the two equal.
 *
 * Exports: createMemorySearchRepository(), scopeSql().
 * Depends on: @forge/core, types/storage-driver.types.
 */

import { buildMatch } from '@forge/core';
import type { MemoryRepository, MemoryScope } from '@forge/core';
import type { SqlDriver, SqlValue } from '#/types/storage-driver.types.js';

const places = (n: number): string => Array<string>(n).fill('?').join(', ');

/**
 * The WHERE conditions (on alias `r` for `memory_records`) and their parameters that express the scope:
 * kinds, statuses, rejected approaches only as `rejected`, never a decision in the `rejected` state, and
 * the tag rule (a record with no tags shows only when the scope has no tags).
 */
export function scopeSql(scope: MemoryScope): { where: string[]; params: SqlValue[] } {
  const where = [
    `r.kind IN (${places(scope.kinds.length)})`,
    `r.status IN (${places(scope.status.length)})`,
    "NOT (r.kind = 'decision' AND r.status = 'rejected')",
    "(r.kind <> 'rejected' OR (? = 1 AND r.status = 'rejected'))",
  ];

  const params: SqlValue[] = [
    ...scope.kinds,
    ...scope.status,
    scope.include_rejected ? 1 : 0,
  ];

  if (scope.tags.length > 0) {
    where.push(
      `EXISTS (SELECT 1 FROM memory_tags t WHERE t.project = r.project AND t.id = r.id
                 AND t.tag IN (${places(scope.tags.length)}))`,
    );

    params.push(...scope.tags);
  }

  return { where, params };
}

export function createMemorySearchRepository(
  driver: SqlDriver,
): Pick<MemoryRepository, 'searchLexical' | 'documentFrequency'> {
  return {
    async searchLexical({ project, match, scope, limit, snippet }) {
      if (match.trim() === '' || scope.kinds.length === 0 || scope.status.length === 0) {
        return [];
      }

      const { where, params } = scopeSql(scope);
      const snippetColumn = snippet
        ? ", snippet(memory_fts, -1, char(1), char(2), '…', 24) AS snip"
        : '';

      return driver
        .all<{ id: string; score: number; snip?: string }>(
          `SELECT r.id AS id, -bm25(memory_fts, 10, 6, 3, 5, 1, 0, 0) AS score${snippetColumn}
             FROM memory_fts
             JOIN memory_records r ON r.project = memory_fts.project AND r.id = memory_fts.id
            WHERE memory_fts MATCH ? AND memory_fts.project = ? AND r.project = ?
              AND ${where.join(' AND ')}
            ORDER BY score DESC, r.id
            LIMIT ?`,
          [match, project, project, ...params, limit],
        )
        .map((r) => ({
          id: r.id,
          score: r.score,
          snippet: snippet ? (r.snip ?? null) : null,
        }));
    },

    async documentFrequency(project, terms) {
      const out: Record<string, number> = {};
      for (const term of terms) {
        const match = buildMatch({ terms: [term], mode: 'and' });
        out[term] =
          match === null
            ? 0
            : (driver.get<{ n: number }>(
                `SELECT COUNT(*) AS n FROM memory_fts WHERE memory_fts MATCH ? AND project = ?`,
                [match, project],
              )?.n ?? 0);
      }

      return out;
    },
  };
}

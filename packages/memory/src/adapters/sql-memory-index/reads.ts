/**
 * Plain reads of the SQL memory index: scope-checked row lists, reference lists and proposal conflicts.
 *
 * Why: the Director's lists (every rejected approach, pinned decisions, every active decision), the owner's
 *   list and the digest all read rows through one rule: kind and status are narrowed in the query and the
 *   tag rule is applied to what comes back, so a record the scope does not admit never reaches any of them.
 *   A pending proposal is also shown with the active decisions it may conflict with (they share its
 *   distinctive words), computed on read and never stored.
 *
 * Exports: RANK, newestFirst(), admittedRows(), refsOf(), conflictsOf().
 * Depends on: @forge/core, adapters/sql-memory-index/{related,views}.
 */

import { directorScope, scopeAdmits } from '@forge/core';
import type { MemoryRecordRef, MemoryRow, MemoryScope, StorageTx } from '@forge/core';
import { similarText } from '#/adapters/sql-memory-index/related.js';
import { lineOf } from '#/adapters/sql-memory-index/views.js';

export const RANK = { proposal: 0, decision: 1, rejected: 2, outcome: 3 } as const;

/** Newest `created_at` first, the larger id first on a tie. */
export const newestFirst = (a: MemoryRow, b: MemoryRow): number => {
  if (a.created_at === b.created_at) {
    return a.id < b.id ? 1 : -1;
  }

  return a.created_at < b.created_at ? 1 : -1;
};

/** Rows of the project the scope admits (kind and status are narrowed in the query, tags here). */
export async function admittedRows(
  t: StorageTx,
  project: string,
  scope: MemoryScope,
  pinned?: boolean,
): Promise<MemoryRow[]> {
  const rows = await t.memory.list(project, {
    kinds: scope.kinds,
    statuses: scope.status,
    ...(pinned === undefined ? {} : { pinned }),
  });

  const tags = await t.memory.tagsOf(
    project,
    rows.map((r) => r.id),
  );

  return rows.filter((r) =>
    scopeAdmits(scope, { kind: r.kind, status: r.status, tags: tags[r.id] ?? [] }),
  );
}

/** Id, statement and, when it has any, tags: the shape the Director reads. */
export async function refsOf(
  t: StorageTx,
  project: string,
  rows: readonly MemoryRow[],
): Promise<MemoryRecordRef[]> {
  const tags = await t.memory.tagsOf(
    project,
    rows.map((r) => r.id),
  );

  return rows.map((r) => ({
    id: r.id,
    statement: r.statement,
    ...((tags[r.id] ?? []).length > 0 ? { tags: tags[r.id] as string[] } : {}),
  }));
}

/** Other active decisions that share the distinctive words of a pending proposal, at most three. */
export async function conflictsOf(
  tx: StorageTx,
  row: MemoryRow,
): Promise<{ id: string; line: string }[]> {
  const counts = (await tx.memory.counts(row.project)).filter(
    (c) => c.status === 'active',
  );

  const n = counts.reduce((sum, c) => sum + c.count, 0);
  const similar = await similarText(tx, row.project, row, directorScope(), n);

  const found: { id: string; line: string }[] = [];
  for (const h of similar.slice(0, 3)) {
    const other = await tx.memory.get(row.project, h.id);
    if (other !== null) {
      found.push({ id: other.id, line: lineOf(other, 160) });
    }
  }

  return found;
}

/**
 * Database-backed memory index — search, get, related and the lists the Director reads, scope-checked and logged.
 *
 * Why: the Director and the Workers read project memory by asking, not by loading everything. One index serves
 *   all readers (the Director's steps, the Worker tools, the owner's screen, the CLI) so a record is found and
 *   shown the same way for each, with what each may see decided in one place: a Worker only the active
 *   decisions (and rejected approaches when its agent asks) of its slice, an id outside that slice is simply
 *   not found, and a Worker's scope can only be narrowed by what it sends. Every search, get and related call
 *   leaves one row in the access log, a zero-hit search included, so the owner can see what memory failed to
 *   answer. Rejected approaches are never ranked away: `rejected()` returns them all (d-0141 item 6, d-0168).
 *
 * Exports: createSqlMemoryIndex().
 * Depends on: @forge/core, adapters/sql-memory-index/{search,related,reads,scopes,views}, types/sql-memory.
 *   IO: the injected storage only.
 */

import { directorScope, ownerScope, scopeAdmits } from '@forge/core';
import type {
  MemoryDigest,
  MemoryIndex,
  MemoryListEntry,
  MemoryRecordView,
  NewMemoryAccess,
  StorageTx,
} from '@forge/core';
import { runRelated } from '#/adapters/sql-memory-index/related.js';
import {
  RANK,
  admittedRows,
  conflictsOf,
  newestFirst,
  refsOf,
} from '#/adapters/sql-memory-index/reads.js';
import { baseScope } from '#/adapters/sql-memory-index/scopes.js';
import { runSearch } from '#/adapters/sql-memory-index/search.js';
import { recordView } from '#/adapters/sql-memory-index/views.js';
import type { SqlIndexDeps } from '#/types/sql-memory.types.js';

const DIGEST_TAGS = 40;

export function createSqlMemoryIndex(deps: SqlIndexDeps): MemoryIndex {
  const at = (): string => deps.now().toISOString();

  const tx = <T>(fn: (t: StorageTx) => Promise<T>): Promise<T> =>
    deps.storage.transaction(fn);

  const log = (t: StorageTx, project: string, row: NewMemoryAccess) =>
    t.memory.appendAccess(project, row);

  return {
    async search(q) {
      return tx(async (t) => {
        const r = await runSearch(t, deps.now(), q);
        await log(t, q.project, {
          at: at(),
          actor: q.actor,
          tool: 'search',
          query: q.text ?? (r.terms.length > 0 ? r.terms.join(' ') : null),
          terms: r.terms,
          filters: {
            kinds: r.scope.kinds,
            status: r.scope.status,
            tags: r.scope.tags,
            k: r.k,
            offset: r.offset,
          },
          hit_ids: r.hits.map((h) => h.id),
          total: r.total,
          ids: null,
          run_id: q.run_id ?? null,
          ticket_id: q.ticket_id ?? null,
        });

        return {
          hits: r.hits,
          total: r.total,
          truncated: r.truncated,
          ...(r.narrowed_note === undefined ? {} : { narrowed_note: r.narrowed_note }),
        };
      });
    },

    async get(project, ids, opts) {
      return tx(async (t) => {
        const scope = baseScope(opts.actor, opts.scope);
        const records: MemoryRecordView[] = [];
        const missing: string[] = [];
        for (const id of ids) {
          const row = await t.memory.get(project, id);
          const tags =
            row === null ? [] : ((await t.memory.tagsOf(project, [id]))[id] ?? []);

          if (
            row === null ||
            !scopeAdmits(scope, { kind: row.kind, status: row.status, tags })
          ) {
            missing.push(id);
            continue;
          }

          const links = await t.memory.linksOf(project, id);
          const view = recordView(row, tags, links.out, opts.full === true);
          const conflicts = row.status === 'pending' ? await conflictsOf(t, row) : [];
          records.push(
            conflicts.length > 0 ? { ...view, possible_conflicts: conflicts } : view,
          );
        }

        await log(t, project, {
          at: at(),
          actor: opts.actor,
          tool: 'get',
          query: null,
          terms: null,
          filters: { full: opts.full === true },
          hit_ids: null,
          total: records.length,
          ids: [...ids],
          run_id: opts.run_id ?? null,
          ticket_id: opts.ticket_id ?? null,
        });

        return { records, missing };
      });
    },

    async related(project, id, k, opts) {
      return tx(async (t) => {
        const found = await runRelated(
          t,
          project,
          id,
          k,
          baseScope(opts.actor, opts.scope),
        );

        await log(t, project, {
          at: at(),
          actor: opts.actor,
          tool: 'related',
          query: null,
          terms: null,
          filters: { k },
          hit_ids: found === null ? null : found.map((f) => f.id),
          total: found === null ? null : found.length,
          ids: [id],
          run_id: opts.run_id ?? null,
          ticket_id: opts.ticket_id ?? null,
        });

        return found;
      });
    },

    async list(project, scope = ownerScope()): Promise<MemoryListEntry[]> {
      return tx(async (t) => {
        const rows = (await admittedRows(t, project, scope)).filter(
          (r) => r.kind !== 'outcome',
        );

        const tags = await t.memory.tagsOf(
          project,
          rows.map((r) => r.id),
        );

        return rows
          .sort((a, b) => RANK[a.kind] - RANK[b.kind] || (a.id < b.id ? -1 : 1))
          .map((r) => ({
            id: r.id,
            kind: r.kind,
            status: r.status,
            statement: r.statement,
            tags: tags[r.id] ?? [],
            pinned: r.pinned,
            imported: r.imported_from !== null,
          }));
      });
    },

    async digest(project, scope = directorScope()): Promise<MemoryDigest> {
      return tx(async (t) => {
        const rows = await admittedRows(t, project, scope);
        const tags = await t.memory.tagsOf(
          project,
          rows.map((r) => r.id),
        );

        const tally = new Map<string, number>();
        for (const r of rows) {
          for (const tag of tags[r.id] ?? []) {
            tally.set(tag, (tally.get(tag) ?? 0) + 1);
          }
        }

        const proposals = scope.kinds.includes('proposal')
          ? (await t.memory.counts(project))
              .filter((c) => c.kind === 'proposal' && c.status === 'pending')
              .reduce((n, c) => n + c.count, 0)
          : 0;

        return {
          decisions: rows.filter((r) => r.kind === 'decision' && r.status === 'active')
            .length,
          rejected: rows.filter((r) => r.kind === 'rejected').length,
          proposals,
          pinned: rows.filter(
            (r) => r.pinned && r.kind === 'decision' && r.status === 'active',
          ).length,
          tags: [...tally]
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
            .slice(0, DIGEST_TAGS),
        };
      });
    },

    async rejected(project, limit, scope = directorScope()) {
      return tx(async (t) => {
        const rows = (await admittedRows(t, project, scope))
          .filter((r) => r.kind === 'rejected')
          .sort(newestFirst);

        return refsOf(t, project, limit === undefined ? rows : rows.slice(0, limit));
      });
    },

    async pinned(project, limit, scope = directorScope()) {
      return tx(async (t) => {
        const rows = (await admittedRows(t, project, scope, true))
          .filter((r) => r.kind === 'decision' && r.status === 'active')
          .sort(newestFirst);

        return refsOf(t, project, rows.slice(0, limit));
      });
    },

    async decisions(project, scope = directorScope()) {
      return tx(async (t) => {
        const rows = (await admittedRows(t, project, scope))
          .filter((r) => r.kind === 'decision' && r.status === 'active')
          .sort(newestFirst);

        return refsOf(t, project, rows);
      });
    },

    async history(project, id) {
      return tx(async (t) =>
        (await t.memory.get(project, id)) === null ? null : t.memory.history(project, id),
      );
    },
  };
}

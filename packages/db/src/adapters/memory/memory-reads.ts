/**
 * In-memory reads of project memory: by key, by filter, counts, tags, links, history and import checks.
 *
 * Why: engine and server tests run on this backend, so reads must answer as SQLite does: filters on kind,
 *   status and any-of tags apply to the rows, ids list in order, one project never sees another's rows, and
 *   every value comes back as a copy so a test cannot change stored memory by mutating a result.
 *
 * Exports: memoryMemoryReads().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { createHash } from 'node:crypto';
import type { ImportedRowCheck, MemoryRepository, MemoryRow } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

const sha = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

const byId = (a: MemoryRow, b: MemoryRow): number => (a.id < b.id ? -1 : 1);

const newestFirst = (a: MemoryRow, b: MemoryRow): number => {
  if (a.created_at === b.created_at) {
    return a.id < b.id ? 1 : -1;
  }

  return a.created_at < b.created_at ? 1 : -1;
};

export function memoryMemoryReads(
  state: MemoryState,
): Pick<
  MemoryRepository,
  | 'get'
  | 'list'
  | 'counts'
  | 'tagStats'
  | 'tagsOf'
  | 'linksOf'
  | 'history'
  | 'checksForImport'
> {
  const projectRows = (project: string): MemoryRow[] =>
    [...state.memoryRows.values()].filter((r) => r.project === project);

  const tagsFor = (project: string, id: string): string[] =>
    state.memoryTags.get(JSON.stringify([project, id])) ?? [];

  return {
    async get(project, id) {
      const row = state.memoryRows.get(JSON.stringify([project, id]));

      return row ? structuredClone(row) : null;
    },

    async list(project, filter = {}) {
      const rows = projectRows(project)
        .filter(
          (r) =>
            (!filter.kinds || filter.kinds.includes(r.kind)) &&
            (!filter.statuses || filter.statuses.includes(r.status)) &&
            (!filter.ids || filter.ids.includes(r.id)) &&
            (filter.pinned === undefined || r.pinned === filter.pinned) &&
            (!filter.tags ||
              filter.tags.length === 0 ||
              tagsFor(project, r.id).some((t) => filter.tags?.includes(t))),
        )
        .sort(filter.order === 'newest' ? newestFirst : byId);

      const from = filter.offset ?? 0;

      return structuredClone(
        filter.limit === undefined
          ? rows.slice(from)
          : rows.slice(from, from + filter.limit),
      );
    },

    async counts(project) {
      const tally = new Map<
        string,
        { kind: MemoryRow['kind']; status: MemoryRow['status']; count: number }
      >();

      for (const r of projectRows(project)) {
        const k = `${r.kind}/${r.status}`;
        const cur = tally.get(k) ?? { kind: r.kind, status: r.status, count: 0 };
        tally.set(k, { ...cur, count: cur.count + 1 });
      }

      return [...tally.values()];
    },

    async tagStats(project, statuses) {
      const out: Record<string, number> = {};
      for (const r of projectRows(project)) {
        if (statuses && !statuses.includes(r.status)) {
          continue;
        }

        for (const t of tagsFor(project, r.id)) {
          out[t] = (out[t] ?? 0) + 1;
        }
      }

      return out;
    },

    async tagsOf(project, ids) {
      const out: Record<string, string[]> = {};
      for (const id of ids) {
        const tags = tagsFor(project, id);
        if (tags.length > 0) {
          out[id] = [...tags];
        }
      }

      return out;
    },

    async linksOf(project, id) {
      const mine = state.memoryLinks.filter(
        (l) => l.project === project && l.from_id === id,
      );

      const strip = ({ project: _project, ...l }: (typeof mine)[number]) => {
        void _project;

        return l;
      };

      const shared = mine
        .filter((l) => l.rel === 'card' || l.rel === 'ticket')
        .flatMap((l) =>
          state.memoryLinks
            .filter(
              (o) =>
                o.project === project &&
                o.rel === l.rel &&
                o.target === l.target &&
                o.from_id !== id,
            )
            .map((o) => ({
              id: o.from_id,
              rel: l.rel as 'card' | 'ticket',
              target: l.target,
            })),
        )
        .filter(
          (x, i, all) => all.findIndex((y) => y.id === x.id && y.rel === x.rel) === i,
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1));

      return {
        out: mine
          .map(strip)
          .sort((a, b) => (a.rel + a.target < b.rel + b.target ? -1 : 1)),
        in: state.memoryLinks
          .filter(
            (l) => l.project === project && l.target_kind === 'record' && l.target === id,
          )
          .map(strip),
        shared,
      };
    },

    async history(project, id) {
      return structuredClone({
        events: state.memoryEvents
          .filter((e) => e.project === project && e.id === id)
          .map(({ project: _project, ...e }) => {
            void _project;

            return e;
          }),
        versions: state.memoryVersions
          .filter((v) => v.project === project && v.id === id)
          .map(({ project: _project, id: _id, ...v }) => {
            void _project;
            void _id;

            return v;
          }),
      });
    },

    async checksForImport(project) {
      const moved = new Set(
        state.memoryEvents
          .filter(
            (e) =>
              e.project === project &&
              ['approved', 'rejected', 'superseded'].includes(e.event),
          )
          .map((e) => e.id),
      );

      return projectRows(project)
        .filter((r) => r.imported_from !== null)
        .sort(byId)
        .map((r): ImportedRowCheck => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          statement: r.statement,
          body_sha256: sha(r.body),
          tags: [...tagsFor(project, r.id)],
          imported_from: r.imported_from,
          moved: moved.has(r.id),
        }));
    },
  };
}

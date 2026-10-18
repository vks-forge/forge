/**
 * SQLite reads of memory records: by key, by filter, counts, tags and history.
 *
 * Why: the Director, the Worker tools, the web and the importer's verification all read memory rows, and
 *   every one of them must see only what it asked for: kind, status and tag filters are part of the query,
 *   never applied to a ranked list afterwards, and one project's rows never answer another project's
 *   question. Nothing here writes; the only writer of memory rows is the records repository.
 *
 * Exports: createMemoryReadRepository().
 * Depends on: @forge/core, adapters/sqlite/memory-rows, shared/db-errors, types/storage-driver.types.
 */

import { MemoryAidVersion, MemoryEvent } from '@forge/core';
import type {
  ImportedRowCheck,
  MemoryCount,
  MemoryListFilter,
  MemoryRepository,
  MemoryStatus,
} from '@forge/core';
import {
  RECORD_COLUMNS,
  recordColumns,
  sha256Hex,
  toMemoryRow,
} from '#/adapters/sqlite/memory-rows.js';
import { parseStored } from '#/shared/db-errors.js';
import type { SqlDriver, SqlValue } from '#/types/storage-driver.types.js';

const places = (n: number): string => Array<string>(n).fill('?').join(', ');

export function createMemoryReadRepository(
  driver: SqlDriver,
): Pick<
  MemoryRepository,
  'get' | 'list' | 'counts' | 'tagStats' | 'tagsOf' | 'history' | 'checksForImport'
> {
  const tagsOf = (project: string, ids: readonly string[]): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    if (ids.length === 0) {
      return out;
    }

    for (const r of driver.all<{ id: string; tag: string }>(
      `SELECT id, tag FROM memory_tags WHERE project = ? AND id IN (${places(ids.length)})
        ORDER BY id, tag`,
      [project, ...ids],
    )) {
      out[r.id] = [...(out[r.id] ?? []), r.tag];
    }

    return out;
  };

  return {
    async get(project, id) {
      const raw = driver.get(
        `SELECT ${RECORD_COLUMNS} FROM memory_records WHERE project = ? AND id = ?`,
        [project, id],
      );

      return raw ? toMemoryRow(raw) : null;
    },

    async list(project, filter: MemoryListFilter = {}) {
      const where = ['r.project = ?'];
      const params: SqlValue[] = [project];
      if (filter.kinds) {
        where.push(`r.kind IN (${places(filter.kinds.length)})`);
        params.push(...filter.kinds);
      }

      if (filter.statuses) {
        where.push(`r.status IN (${places(filter.statuses.length)})`);
        params.push(...filter.statuses);
      }

      if (filter.ids) {
        where.push(`r.id IN (${places(filter.ids.length)})`);
        params.push(...filter.ids);
      }

      if (filter.pinned !== undefined) {
        where.push('r.pinned = ?');
        params.push(filter.pinned ? 1 : 0);
      }

      if (filter.tags && filter.tags.length > 0) {
        where.push(
          `EXISTS (SELECT 1 FROM memory_tags t WHERE t.project = r.project AND t.id = r.id
                     AND t.tag IN (${places(filter.tags.length)}))`,
        );

        params.push(...filter.tags);
      }

      const order = filter.order === 'newest' ? 'r.created_at DESC, r.id DESC' : 'r.id';
      let page = '';
      if (filter.limit !== undefined || filter.offset !== undefined) {
        page = ' LIMIT ? OFFSET ?';
        params.push(filter.limit ?? -1, filter.offset ?? 0);
      }

      return driver
        .all(
          `SELECT ${recordColumns('r')} FROM memory_records r
            WHERE ${where.join(' AND ')} ORDER BY ${order}${page}`,
          params,
        )
        .map(toMemoryRow);
    },

    async counts(project) {
      return driver
        .all<{ kind: string; status: string; n: number }>(
          `SELECT kind, status, COUNT(*) AS n FROM memory_records WHERE project = ?
            GROUP BY kind, status ORDER BY kind, status`,
          [project],
        )
        .map((r) => ({ kind: r.kind, status: r.status, count: r.n }) as MemoryCount);
    },

    async tagStats(project, statuses?: readonly MemoryStatus[]) {
      const filter = statuses ? ` AND r.status IN (${places(statuses.length)})` : '';
      const out: Record<string, number> = {};
      for (const r of driver.all<{ tag: string; n: number }>(
        `SELECT t.tag AS tag, COUNT(*) AS n FROM memory_tags t
           JOIN memory_records r ON r.project = t.project AND r.id = t.id
          WHERE t.project = ?${filter} GROUP BY t.tag ORDER BY n DESC, t.tag`,
        [project, ...(statuses ?? [])],
      )) {
        out[r.tag] = r.n;
      }

      return out;
    },

    async tagsOf(project, ids) {
      return tagsOf(project, ids);
    },

    async history(project, id) {
      const events = driver
        .all(
          `SELECT seq, id, at, actor, event, from_status, to_status, reason FROM memory_events
            WHERE project = ? AND id = ? ORDER BY seq`,
          [project, id],
        )
        .map((r) => parseStored(MemoryEvent, r, 'memory event'));

      const versions = driver
        .all(
          `SELECT version, at, actor, gist, aliases, pinned FROM memory_aid_versions
            WHERE project = ? AND id = ? ORDER BY version`,
          [project, id],
        )
        .map((r) =>
          parseStored(
            MemoryAidVersion,
            { ...r, pinned: r['pinned'] === 1 },
            'memory aid version',
          ),
        );

      return { events, versions };
    },

    async checksForImport(project) {
      const moved = new Set(
        driver
          .all<{ id: string }>(
            `SELECT DISTINCT id FROM memory_events WHERE project = ?
               AND event IN ('approved','rejected','superseded')`,
            [project],
          )
          .map((r) => r.id),
      );

      const rows = driver
        .all(
          `SELECT ${RECORD_COLUMNS} FROM memory_records
            WHERE project = ? AND imported_from IS NOT NULL ORDER BY id`,
          [project],
        )
        .map(toMemoryRow);

      const tags = tagsOf(
        project,
        rows.map((r) => r.id),
      );

      return rows.map((r): ImportedRowCheck => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        statement: r.statement,
        body_sha256: sha256Hex(r.body),
        tags: tags[r.id] ?? [],
        imported_from: r.imported_from,
        moved: moved.has(r.id),
      }));
    },
  };
}

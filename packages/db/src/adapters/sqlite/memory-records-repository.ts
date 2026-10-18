/**
 * SQLite repository for memory records: the one door that writes `memory_records`.
 *
 * Why: a project's memory is what the Director plans against and Workers are told not to contradict, so a
 *   record's words never change after insert and it moves only along approve, reject and supersede. This
 *   file is the only place that inserts or updates a record (a rule test scans the sources for any other
 *   writer); the triggers of migration 0029 are the second lock. Each write also stores its history entry,
 *   its tags and links and its search-index entry in the same transaction, so a rolled-back write leaves
 *   nothing behind. Ids count up per letter and are never reused because rows are never deleted.
 *
 * Exports: createMemoryRecordsRepository().
 * Depends on: @forge/core, adapters/sqlite/memory-fts, adapters/sqlite/memory-rows, types/storage-driver.types.
 */

import {
  InvalidInputError,
  MemoryRecordNotFoundError,
  MemoryRecordStateError,
  MemoryRow,
  MemoryTag,
} from '@forge/core';
import type {
  MemoryEdge,
  MemoryEdgeFields,
  MemoryLink,
  MemoryRepository,
  NewMemoryEvent,
} from '@forge/core';
import {
  indexRecord,
  reindexProject,
  unindexRecord,
} from '#/adapters/sqlite/memory-fts.js';
import {
  RECORD_COLUMNS,
  RECORD_COLUMN_COUNT,
  joinAliases,
  toMemoryRow,
} from '#/adapters/sqlite/memory-rows.js';
import type { SqlDriver, SqlValue } from '#/types/storage-driver.types.js';

const places = (n: number): string => Array<string>(n).fill('?').join(', ');

const EDGES: Record<
  MemoryEdge,
  { from: [string, string]; to: [string, string]; label: string; stamps: string[] }
> = {
  approve: {
    from: ['proposal', 'pending'],
    to: ['decision', 'active'],
    label: 'a pending proposal',
    stamps: ['approved_at', 'approved_by'],
  },
  reject: {
    from: ['proposal', 'pending'],
    to: ['rejected', 'rejected'],
    label: 'a pending proposal',
    stamps: ['rejected_at', 'rejected_by', 'rejected_reason'],
  },
  supersede: {
    from: ['decision', 'active'],
    to: ['decision', 'superseded'],
    label: 'an active decision',
    stamps: ['superseded_by', 'valid_to'],
  },
};

export function createMemoryRecordsRepository(
  driver: SqlDriver,
): Pick<
  MemoryRepository,
  'insertRecord' | 'transition' | 'setAids' | 'nextId' | 'reindex'
> {
  const rowOf = (project: string, id: string) => {
    const raw = driver.get(
      `SELECT ${RECORD_COLUMNS} FROM memory_records WHERE project = ? AND id = ?`,
      [project, id],
    );

    return raw ? toMemoryRow(raw) : null;
  };

  const tagWords = (project: string, id: string): string[] =>
    driver
      .all<{ tag: string }>(
        'SELECT tag FROM memory_tags WHERE project = ? AND id = ? ORDER BY tag',
        [project, id],
      )
      .map((t) => t.tag);

  const addEvent = (project: string, id: string, e: NewMemoryEvent): number => {
    driver.run(
      `INSERT INTO memory_events (project, id, at, actor, event, from_status, to_status, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [project, id, e.at, e.actor, e.event, e.from_status, e.to_status, e.reason],
    );

    return Number(driver.get<{ seq: number }>('SELECT last_insert_rowid() AS seq')?.seq);
  };

  return {
    async insertRecord(rowIn, tagsIn, links: readonly MemoryLink[], event) {
      const row = MemoryRow.parse(rowIn);
      const tags = [...new Set(tagsIn.map((t) => MemoryTag.parse(t)))].sort();

      if (rowOf(row.project, row.id)) {
        throw new InvalidInputError(
          `memory record ${row.id} already exists in ${row.project}`,
        );
      }

      driver.run(
        `INSERT INTO memory_records (${RECORD_COLUMNS}) VALUES (${places(RECORD_COLUMN_COUNT)})`,
        [
          row.project,
          row.id,
          row.kind,
          row.status,
          row.statement,
          row.body,
          row.source_type,
          row.source_ref,
          row.author,
          row.origin,
          row.confidence,
          row.created_at,
          row.valid_from,
          row.valid_to,
          row.superseded_by,
          row.pinned ? 1 : 0,
          row.approved_at,
          row.approved_by,
          row.rejected_at,
          row.rejected_by,
          row.rejected_reason,
          row.gist,
          joinAliases(row.aliases),
          row.imported_from,
          row.raw_front_matter,
          row.lenient_fields === null ? null : JSON.stringify(row.lenient_fields),
        ],
      );

      for (const tag of tags) {
        driver.run('INSERT INTO memory_tags (project, id, tag) VALUES (?, ?, ?)', [
          row.project,
          row.id,
          tag,
        ]);
      }

      for (const l of links) {
        driver.run(
          `INSERT OR IGNORE INTO memory_links (project, from_id, rel, target_kind, target)
           VALUES (?, ?, ?, ?, ?)`,
          [row.project, row.id, l.rel, l.target_kind, l.target],
        );
      }

      indexRecord(driver, row, tags);

      return addEvent(row.project, row.id, event);
    },

    async transition(project, id, edge, fields: MemoryEdgeFields, event) {
      const row = rowOf(project, id);
      if (!row) {
        throw new MemoryRecordNotFoundError(id);
      }

      const rule = EDGES[edge];
      if (row.kind !== rule.from[0] || row.status !== rule.from[1]) {
        throw new MemoryRecordStateError(
          id,
          `${id} is not ${rule.label} (it is ${row.kind}, ${row.status})`,
        );
      }

      const given = fields as Record<string, string>;
      driver.run(
        `UPDATE memory_records SET kind = ?, status = ?, ${rule.stamps.map((s) => `${s} = ?`).join(', ')}
          WHERE project = ? AND id = ?`,
        [...rule.to, ...rule.stamps.map((s) => given[s] as SqlValue), project, id],
      );

      return addEvent(project, id, event);
    },

    async setAids(project, id, aids, actor, at) {
      const row = rowOf(project, id);
      if (!row) {
        throw new MemoryRecordNotFoundError(id);
      }

      const next = MemoryRow.pick({ gist: true, aliases: true, pinned: true }).parse(
        aids,
      );

      driver.run(
        'UPDATE memory_records SET gist = ?, aliases = ?, pinned = ? WHERE project = ? AND id = ?',
        [next.gist, joinAliases(next.aliases), next.pinned ? 1 : 0, project, id],
      );

      const version =
        (driver.get<{ v: number | null }>(
          'SELECT MAX(version) AS v FROM memory_aid_versions WHERE project = ? AND id = ?',
          [project, id],
        )?.v ?? 0) + 1;

      driver.run(
        `INSERT INTO memory_aid_versions (project, id, version, at, actor, gist, aliases, pinned)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          project,
          id,
          version,
          at,
          actor,
          next.gist,
          joinAliases(next.aliases),
          next.pinned ? 1 : 0,
        ],
      );

      addEvent(project, id, {
        at,
        actor,
        event: 'aids_set',
        from_status: row.status,
        to_status: row.status,
        reason: null,
      });

      unindexRecord(driver, project, id);
      indexRecord(driver, { ...row, ...next }, tagWords(project, id));
    },

    async nextId(project, letter) {
      if (!/^[a-z]$/.test(letter)) {
        throw new InvalidInputError(
          `id letter must be one lower-case letter, got ${letter}`,
        );
      }

      const highest =
        driver.get<{ n: number | null }>(
          `SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) AS n FROM memory_records
            WHERE project = ? AND SUBSTR(id, 1, 2) = ?`,
          [project, `${letter}-`],
        )?.n ?? 0;

      return `${letter}-${String(highest + 1).padStart(4, '0')}`;
    },

    async reindex(project) {
      reindexProject(driver, project);
    },
  };
}

/**
 * SQLite access log and import attempts for project memory.
 *
 * Why: the owner needs to know whether search finds what is asked for, so every read of memory (a
 *   search, a get, a related lookup, by the Director, a Worker, the CLI or the web) leaves one row, zero-hit
 *   searches included, and the log is pruned by count and age so it cannot grow without bound. Import
 *   attempts are rows of their own: the latest attempt tells the server whether a project's old git
 *   repository was brought in and proven, which decides whether its memory is read from the database or
 *   still from the old files. This table is the only thing here that is not append-only history, because an
 *   attempt moves from pending to verified.
 *
 * Exports: createMemoryLogRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { MemoryAccessLogRow, MemoryImportRecord } from '@forge/core';
import type { MemoryRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

const orNull = (v: unknown): unknown => v ?? null;

export function createMemoryLogRepository(
  driver: SqlDriver,
): Pick<
  MemoryRepository,
  'appendAccess' | 'listAccess' | 'pruneAccess' | 'importState' | 'saveImport'
> {
  return {
    async appendAccess(project, row) {
      driver.run(
        `INSERT INTO memory_access_log
           (project, at, actor, tool, query, terms_json, filters_json, hit_ids_json, total, ids_json, run_id, ticket_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          project,
          row.at,
          row.actor,
          row.tool,
          row.query,
          row.terms === null ? null : toJson(row.terms),
          toJson(row.filters),
          row.hit_ids === null ? null : toJson(row.hit_ids),
          row.total,
          row.ids === null ? null : toJson(row.ids),
          row.run_id,
          row.ticket_id,
        ],
      );
    },

    async listAccess(project, limit) {
      return driver
        .all(
          `SELECT seq, at, actor, tool, query, terms_json, filters_json, hit_ids_json, total, ids_json,
                  run_id, ticket_id
             FROM memory_access_log WHERE project = ? ORDER BY seq DESC LIMIT ?`,
          [project, limit],
        )
        .map((r) =>
          parseStored(
            MemoryAccessLogRow,
            {
              seq: r['seq'],
              at: r['at'],
              actor: r['actor'],
              tool: r['tool'],
              query: orNull(r['query']),
              terms: fromJson(r['terms_json']),
              filters: fromJson(r['filters_json']) ?? {},
              hit_ids: fromJson(r['hit_ids_json']),
              total: orNull(r['total']),
              ids: fromJson(r['ids_json']),
              run_id: orNull(r['run_id']),
              ticket_id: orNull(r['ticket_id']),
            },
            'memory access row',
          ),
        );
    },

    async pruneAccess(project, keepRows, olderThan) {
      return driver.run(
        `DELETE FROM memory_access_log
          WHERE project = ?
            AND (at < ? OR seq NOT IN (
                  SELECT seq FROM memory_access_log WHERE project = ? ORDER BY seq DESC LIMIT ?))`,
        [project, olderThan, project, keepRows],
      ).changes;
    },

    async importState(project) {
      const r = driver.get(
        `SELECT attempt, at, state, head_sha, files, imported, lenient, rejects_json, backup_path,
                verified_at, repo_deleted_at, message
           FROM memory_imports WHERE project = ? ORDER BY attempt DESC LIMIT 1`,
        [project],
      );

      if (!r) {
        return null;
      }

      const { rejects_json: rejects, ...rest } = r;

      return parseStored(
        MemoryImportRecord,
        { ...rest, rejects: fromJson(rejects) ?? [] },
        'memory import',
      );
    },

    async saveImport(project, record) {
      const r = MemoryImportRecord.parse(record);
      driver.run(
        `INSERT OR REPLACE INTO memory_imports
           (project, attempt, at, state, head_sha, files, imported, lenient, rejects_json, backup_path,
            verified_at, repo_deleted_at, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          project,
          r.attempt,
          r.at,
          r.state,
          r.head_sha,
          r.files,
          r.imported,
          r.lenient,
          toJson(r.rejects),
          r.backup_path,
          r.verified_at,
          r.repo_deleted_at,
          r.message,
        ],
      );
    },
  };
}

/**
 * SQLite RunRepository for the `runs` table.
 *
 * Why: run lifecycle rows are updated as the run progresses (execution-plane.md §8);
 *   usage is stored as JSON and every row is parsed with the core `Run` schema (code.md
 *   rule 4).
 *
 * Exports: createRunRepository().
 * Depends on: @forge/core, shared/json, shared/patches, types/storage-driver.types.
 */

import { Run, UnknownForgeError } from '@forge/core';
import type { RunRepository } from '@forge/core';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import { buildSetClause, parseRunPatch } from '#/shared/patches.js';
import type { ColumnCodec, SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const COLUMNS: Readonly<Record<string, ColumnCodec>> = {
  ticket_id: { column: 'ticket_id' },
  harness: { column: 'harness' },
  driver_version: { column: 'driver_version' },
  session_ref: { column: 'session_ref' },
  cwd: { column: 'cwd' },
  lane: { column: 'lane' },
  started_at: { column: 'started_at' },
  ended_at: { column: 'ended_at' },
  status: { column: 'status' },
  usage: { column: 'usage_json', encode: toJson },
  cost_usd: { column: 'cost_usd' },
  error_family: { column: 'error_family' },
  retry_of: { column: 'retry_of' },
};

function toRun(row: SqlRow): Run {
  const { usage_json, ...rest } = dropNulls(row);
  return Run.parse({
    ...rest,
    ...(usage_json === undefined ? {} : { usage: fromJson(usage_json) }),
  });
}

export function createRunRepository(driver: SqlDriver): RunRepository {
  return {
    async get(id) {
      const row = driver.get('SELECT * FROM runs WHERE id = ?', [id]);
      return row ? toRun(row) : null;
    },

    async listByTicket(ticketId) {
      return driver
        .all('SELECT * FROM runs WHERE ticket_id = ? ORDER BY rowid', [ticketId])
        .map(toRun);
    },

    async insert(run) {
      const r = Run.parse(run);
      driver.run(
        `INSERT INTO runs (id, ticket_id, harness, driver_version, session_ref, cwd, lane,
           started_at, ended_at, status, usage_json, cost_usd, error_family, retry_of)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id,
          r.ticket_id,
          r.harness,
          r.driver_version,
          r.session_ref ?? null,
          r.cwd,
          r.lane,
          r.started_at,
          r.ended_at ?? null,
          r.status,
          r.usage === undefined ? null : toJson(r.usage),
          r.cost_usd ?? null,
          r.error_family ?? null,
          r.retry_of ?? null,
        ],
      );
    },

    async update(id, patch) {
      const { sql, params } = buildSetClause(COLUMNS, parseRunPatch(patch));
      if (sql === '') return;
      const res = driver.run(`UPDATE runs SET ${sql} WHERE id = ?`, [...params, id]);
      if (res.changes !== 1) throw new UnknownForgeError(`Run not found: ${id}`);
    },
  };
}

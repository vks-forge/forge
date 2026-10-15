/**
 * SQLite repositories for `harness_versions` and `harness_tool_schemas`.
 *
 * Why: the server records the result of each build's compatibility check and the owner's
 *   decision on each built-in tool's schema, and reads them back for every run to build the
 *   run's tool policy. Rows are re-parsed with the core schemas on read, so a hand-edited
 *   status or a report that no longer parses fails closed (the tool stays pending) instead
 *   of reaching policy as an approval. Upsert keeps a row's place in the list.
 *
 * Exports: createHarnessVersionRepository(), createHarnessToolSchemaRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { HarnessToolSchema, HarnessVersion } from '@forge/core';
import type { HarnessToolSchemaRepository, HarnessVersionRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

function toVersion(row: SqlRow): HarnessVersion {
  const { report_json: report, ...rest } = row;

  return parseStored(
    HarnessVersion,
    dropNulls({
      ...rest,
      report: typeof report === 'string' ? (JSON.parse(report) as unknown) : null,
    }),
    'harness version',
  );
}

export function createHarnessVersionRepository(
  driver: SqlDriver,
): HarnessVersionRepository {
  return {
    async get(kind, version) {
      const row = driver.get(
        'SELECT * FROM harness_versions WHERE kind = ? AND version = ?',
        [kind, version],
      );

      return row ? toVersion(row) : null;
    },

    async listByCompat(compat) {
      return driver
        .all('SELECT * FROM harness_versions WHERE compat = ? ORDER BY rowid', [compat])
        .map(toVersion);
    },

    async upsert(row) {
      const v = HarnessVersion.parse(row);
      driver.run(
        `INSERT INTO harness_versions (kind, version, compat, report_json, checked_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (kind, version) DO UPDATE SET compat = excluded.compat,
           report_json = excluded.report_json, checked_at = excluded.checked_at`,
        [
          v.kind,
          v.version,
          v.compat,
          v.report === undefined ? null : JSON.stringify(v.report),
          v.checked_at ?? null,
        ],
      );
    },
  };
}

const toSchema = (row: SqlRow): HarnessToolSchema =>
  parseStored(HarnessToolSchema, dropNulls(row), 'harness tool schema');

export function createHarnessToolSchemaRepository(
  driver: SqlDriver,
): HarnessToolSchemaRepository {
  return {
    async get(kind, version, tool) {
      const row = driver.get(
        'SELECT * FROM harness_tool_schemas WHERE harness_kind = ? AND version = ? AND tool = ?',
        [kind, version, tool],
      );

      return row ? toSchema(row) : null;
    },

    async list(kind, version) {
      return driver
        .all(
          'SELECT * FROM harness_tool_schemas WHERE harness_kind = ? AND version = ? ORDER BY rowid',
          [kind, version],
        )
        .map(toSchema);
    },

    async listByStatus(status) {
      return driver
        .all('SELECT * FROM harness_tool_schemas WHERE status = ? ORDER BY rowid', [
          status,
        ])
        .map(toSchema);
    },

    async upsert(row) {
      const s = HarnessToolSchema.parse(row);
      driver.run(
        `INSERT INTO harness_tool_schemas
           (harness_kind, version, tool, schema_hash, status, decided_by, decided_at, decision_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (harness_kind, version, tool) DO UPDATE SET
           schema_hash = excluded.schema_hash, status = excluded.status,
           decided_by = excluded.decided_by, decided_at = excluded.decided_at,
           decision_reason = excluded.decision_reason`,
        [
          s.harness_kind,
          s.version,
          s.tool,
          s.schema_hash,
          s.status,
          s.decided_by ?? null,
          s.decided_at ?? null,
          s.decision_reason ?? null,
        ],
      );
    },
  };
}

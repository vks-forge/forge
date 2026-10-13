/**
 * checkSchemaCurrent: report whether a database matches this build, without changing it.
 *
 * Why: the hook handler and the MCP server only read and append; they must never
 *   migrate a database that another process owns, yet they must not run against a schema
 *   they do not understand either. This answers the question read-only: current, behind
 *   (migrations pending, start the server that migrates), ahead (a newer build wrote
 *   migrations this one does not know) or edited (an applied migration no longer matches
 *   its checksum), and lets the process refuse to start with a clear reason. It creates
 *   nothing, so a missing `schema_migrations` table reads as "all pending".
 *
 * Exports: checkSchemaCurrent().
 * Depends on: migrations/registry, migrations/run-migrations, types/migrations.types,
 *   types/storage-driver.types.
 */

import { MIGRATIONS } from '#/migrations/registry.js';
import { migrationChecksum } from '#/migrations/run-migrations.js';
import type { Migration, SchemaReport } from '#/types/migrations.types.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

const byId = (a: number, b: number): number => a - b;

/** Compare the database's recorded migrations with `migrations`; never writes. Precedence: ahead, edited, behind, current. */
export function checkSchemaCurrent(
  driver: SqlDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): SchemaReport {
  const hasTable = driver.get(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  );

  const done = new Map<number, string>(
    hasTable
      ? driver
          .all<{ id: number; checksum: string }>(
            'SELECT id, checksum FROM schema_migrations',
          )
          .map((r) => [r.id, r.checksum])
      : [],
  );

  const known = new Set(migrations.map((m) => m.id));
  const unknown = [...done.keys()].filter((id) => !known.has(id)).sort(byId);
  const edited = migrations
    .filter((m) => done.has(m.id) && done.get(m.id) !== migrationChecksum(m))
    .map((m) => m.id);

  const pending = migrations.filter((m) => !done.has(m.id)).map((m) => m.id);
  const status =
    unknown.length > 0
      ? 'ahead'
      : edited.length > 0
        ? 'edited'
        : pending.length > 0
          ? 'behind'
          : 'current';

  return { status, pending, unknown, edited };
}

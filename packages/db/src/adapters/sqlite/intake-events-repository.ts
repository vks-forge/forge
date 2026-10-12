/**
 * SQLite IntakeEventRepository with constraint-based dedupe.
 *
 * Why: intake must be idempotent (director-core.md §7). Dedupe relies on
 *   UNIQUE(source, dedupe_key) with `ON CONFLICT DO NOTHING`; `changes === 0` means the
 *   duplicate was dropped. Never a read-then-write, which two writers could race.
 *
 * Exports: createIntakeEventRepository().
 * Depends on: @forge/core, shared/json, types/storage-driver.types.
 */

import { IntakeEvent } from '@forge/core';
import type { IntakeEventRepository } from '@forge/core';
import { toJson } from '#/shared/json.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

export function createIntakeEventRepository(driver: SqlDriver): IntakeEventRepository {
  return {
    async insertIfNew(event) {
      const e = IntakeEvent.parse(event);
      const res = driver.run(
        `INSERT INTO intake_events (source, kind, dedupe_key, actor_json, project, payload_json, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (source, dedupe_key) DO NOTHING`,
        [
          e.source,
          e.kind,
          e.dedupe_key,
          toJson(e.actor),
          e.project,
          toJson(e.payload),
          e.received_at,
        ],
      );
      return res.changes === 1;
    },
  };
}

/**
 * SQLite IntakeEventRepository with constraint-based dedupe.
 *
 * Why: chat messages and webhooks are redelivered and can arrive on two connections at
 *   once; if one event created two tickets the user would get duplicate work and
 *   duplicate spend. The database therefore enforces dedupe: UNIQUE(source, dedupe_key)
 *   with `ON CONFLICT DO NOTHING`, where zero changed rows means the duplicate was
 *   dropped. A read-then-insert would let two writers both see "not seen" and both
 *   insert (director-core.md §7).
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

/**
 * SQLite IntakeEventRepository with constraint-based dedupe.
 *
 * Why: chat messages and webhooks are redelivered and can arrive on two connections at
 *   once; if one event created two tickets the user would get duplicate work and
 *   duplicate spend. The database therefore enforces dedupe: UNIQUE(source, dedupe_key)
 *   with `ON CONFLICT DO NOTHING`, where zero changed rows means the duplicate was
 *   dropped. A read-then-insert would let two writers both see "not seen" and both
 *   insert. The caller always gets the stored copy back, with its id and the ticket it was
 *   already mapped to, so a redelivery finds the ticket instead of creating another
 *   (director-core.md §7).
 *
 * Exports: createIntakeEventRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { IntakeEvent, StoredIntakeEvent, UnknownForgeError } from '@forge/core';
import type { IntakeEventRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

function toStored(row: SqlRow): StoredIntakeEvent {
  const { actor_json, payload_json, ...rest } = dropNulls(row);

  return parseStored(
    StoredIntakeEvent,
    { ...rest, actor: fromJson(actor_json), payload: fromJson(payload_json) },
    'intake event',
  );
}

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

      const row = driver.get(
        'SELECT * FROM intake_events WHERE source = ? AND dedupe_key = ?',
        [e.source, e.dedupe_key],
      );

      if (!row) {
        throw new UnknownForgeError('intake event vanished after insert');
      }

      return { inserted: res.changes === 1, event: toStored(row) };
    },

    async markTicket(id, ticketId) {
      const res = driver.run(
        'UPDATE intake_events SET ticket_id = ? WHERE id = ? AND ticket_id IS NULL',
        [ticketId, id],
      );

      return res.changes === 1;
    },

    async get(id) {
      const row = driver.get('SELECT * FROM intake_events WHERE id = ?', [id]);

      return row ? toStored(row) : null;
    },
  };
}

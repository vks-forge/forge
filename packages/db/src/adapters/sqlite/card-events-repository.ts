/**
 * SQLite CardEventRepository for the `card_events` table.
 *
 * Why: a card's history is read in order on the Card page and must never have a gap or a
 *   repeated number, or a page boundary would skip or duplicate an entry. Storage is the
 *   only `seq` allocator (max+1 per card, inside the caller's single-writer transaction),
 *   as for run events. Each row is re-parsed with the core `CardEvent` schema on read, so a
 *   payload that no longer matches its kind fails loudly instead of rendering wrongly.
 *
 * Exports: createCardEventRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { CardEvent, NewCardEvent } from '@forge/core';
import type { CardEventRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toEvent = (row: SqlRow): CardEvent =>
  parseStored(
    CardEvent,
    {
      card_id: row['card_id'],
      seq: row['seq'],
      kind: row['kind'],
      at: row['at'],
      actor: { type: row['actor_type'], id: row['actor_id'] },
      payload: fromJson(row['payload_json']),
    },
    'card event',
  );

export function createCardEventRepository(driver: SqlDriver): CardEventRepository {
  return {
    async append(cardId, event) {
      const e = NewCardEvent.parse(event);
      const head = driver.get<{ next: number }>(
        'SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM card_events WHERE card_id = ?',
        [cardId],
      );

      const seq = head?.next ?? 0;
      driver.run(
        `INSERT INTO card_events (card_id, seq, kind, at, actor_type, actor_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cardId, seq, e.kind, e.at, e.actor.type, e.actor.id, toJson(e.payload)],
      );

      return CardEvent.parse({ ...e, card_id: cardId, seq });
    },

    async list(cardId, filter) {
      return driver
        .all(
          'SELECT * FROM card_events WHERE card_id = ? AND seq > ? ORDER BY seq LIMIT ?',
          [cardId, filter.afterSeq ?? -1, filter.limit],
        )
        .map(toEvent);
    },
  };
}

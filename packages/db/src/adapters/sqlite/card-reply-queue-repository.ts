/**
 * SQLite CardReplyQueueRepository for the `card_reply_queue` table.
 *
 * Why: the Director owes a reply for each new card and each message the owner writes in a
 *   card's chat (d-0134). Keeping that debt in a table instead of engine memory means a
 *   restart resumes it: rows still unclaimed are answered, and a row claimed by a process that
 *   died is claimed again once the claim is older than the stale cutoff. Claiming runs inside
 *   the caller's single-writer transaction, so two ticks can never take the same row. Only
 *   new events are ever enqueued by callers, so existing cards are never auto-answered.
 *
 * Exports: createCardReplyQueueRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { CardReplyQueueItem, NewCardReply } from '@forge/core';
import type { CardReplyQueueRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toItem = (row: SqlRow): CardReplyQueueItem =>
  parseStored(CardReplyQueueItem, dropNulls(row), 'card reply');

export function createCardReplyQueueRepository(
  driver: SqlDriver,
): CardReplyQueueRepository {
  return {
    async enqueue(item) {
      const i = NewCardReply.parse(item);
      driver.run(
        `INSERT INTO card_reply_queue (card_id, event_id, reason, enqueued_at)
         VALUES (?, ?, ?, ?)`,
        [i.card_id, i.event_id, i.reason, i.enqueued_at],
      );

      // Same connection, inside the caller's transaction: no other writer can interleave.
      const row = driver.get<{ id: number }>('SELECT last_insert_rowid() AS id');

      return { ...i, id: row?.id ?? 0 };
    },

    async claim(at, staleBefore) {
      const rows = driver.all(
        `SELECT * FROM card_reply_queue
         WHERE done_at IS NULL AND (claimed_at IS NULL OR claimed_at < ?)
         ORDER BY id`,
        [staleBefore],
      );

      for (const row of rows) {
        driver.run('UPDATE card_reply_queue SET claimed_at = ? WHERE id = ?', [
          at,
          row['id'] as number,
        ]);
      }

      return rows.map((row) => toItem({ ...row, claimed_at: at }));
    },

    async complete(id, at) {
      const res = driver.run(
        'UPDATE card_reply_queue SET done_at = ? WHERE id = ? AND done_at IS NULL',
        [at, id],
      );

      return res.changes === 1;
    },

    async listOpen(cardId) {
      return driver
        .all(
          'SELECT * FROM card_reply_queue WHERE card_id = ? AND done_at IS NULL ORDER BY id',
          [cardId],
        )
        .map(toItem);
    },
  };
}

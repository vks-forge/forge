/**
 * SQLite RunInboxRepository for the `run_inbox` table.
 *
 * Why: a human or the Director steers a live run while it is busy, between turns, or
 *   while the server restarts. The message is written here first and delivered later, so
 *   it is never lost and never delivered twice: `markDelivered` is an update guarded by
 *   `delivered_at IS NULL`, and only the first caller gets `true`. Like run events, the
 *   inbox is numbered by storage alone (max+1 inside the writer's transaction), so two
 *   senders cannot collide or leave a gap that a driver would read as a missing message
 *   (director-core.md §8).
 *
 * Exports: createRunInboxRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { NewRunInboxMessage, RunInboxMessage } from '@forge/core';
import type { RunInboxRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toMessage = (row: SqlRow): RunInboxMessage =>
  parseStored(RunInboxMessage, dropNulls(row), 'run inbox message');

export function createRunInboxRepository(driver: SqlDriver): RunInboxRepository {
  return {
    async append(message) {
      // Runs inside the caller's BEGIN IMMEDIATE transaction, so no other writer can take
      // this number between the read and the insert; a smuggled seq is stripped by parse.
      const m = NewRunInboxMessage.parse(message);
      const head = driver.get<{ next: number }>(
        'SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM run_inbox WHERE run_id = ?',
        [m.run_id],
      );
      const stored = RunInboxMessage.parse({ ...m, seq: head?.next ?? 0 });
      driver.run(
        'INSERT INTO run_inbox (run_id, seq, mode, author, text) VALUES (?, ?, ?, ?, ?)',
        [stored.run_id, stored.seq, stored.mode, stored.author, stored.text],
      );
      return stored;
    },

    async listUndelivered(runId) {
      return driver
        .all(
          'SELECT * FROM run_inbox WHERE run_id = ? AND delivered_at IS NULL ORDER BY seq',
          [runId],
        )
        .map(toMessage);
    },

    async markDelivered(runId, seq, at) {
      const res = driver.run(
        'UPDATE run_inbox SET delivered_at = ? WHERE run_id = ? AND seq = ? AND delivered_at IS NULL',
        [at, runId, seq],
      );
      return res.changes === 1;
    },
  };
}

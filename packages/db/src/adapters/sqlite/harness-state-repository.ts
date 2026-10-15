/**
 * SQLite HarnessStateRepository for the `harness_state` table.
 *
 * Why: when a harness runs out of quota the engine parks it until the reset time, and
 *   dispatch, the ticket page and the harness list all read that pause. One row per
 *   harness, replaced on each new quota error, removed when the time passes. Rows are
 *   re-parsed with the core `HarnessState` schema on read so a hand-edited timestamp fails
 *   closed instead of parking a harness forever or never.
 *
 * Exports: createHarnessStateRepository().
 * Depends on: @forge/core, shared/db-errors, types/storage-driver.types.
 */

import { HarnessState } from '@forge/core';
import type { HarnessStateRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toState = (row: SqlRow): HarnessState =>
  parseStored(HarnessState, row, 'harness state');

export function createHarnessStateRepository(driver: SqlDriver): HarnessStateRepository {
  return {
    async get(harnessId) {
      const row = driver.get('SELECT * FROM harness_state WHERE harness_id = ?', [
        harnessId,
      ]);

      return row ? toState(row) : null;
    },

    async upsert(state) {
      const s = HarnessState.parse(state);
      driver.run(
        `INSERT INTO harness_state (harness_id, paused_until, reason, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (harness_id) DO UPDATE SET paused_until = excluded.paused_until,
           reason = excluded.reason, updated_at = excluded.updated_at`,
        [s.harness_id, s.paused_until, s.reason, s.updated_at],
      );
    },

    async clear(harnessId) {
      const res = driver.run('DELETE FROM harness_state WHERE harness_id = ?', [
        harnessId,
      ]);

      return res.changes > 0;
    },

    async list() {
      return driver.all('SELECT * FROM harness_state ORDER BY harness_id').map(toState);
    },
  };
}

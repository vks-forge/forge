/**
 * SQLite RunEventRepository: the append-only `run_events` log.
 *
 * Why: run_events is the UI and replay source (director-core.md §3). (run_id, seq) is
 *   the primary key, so a repeated seq is rejected by the database, and reads are
 *   ordered by seq regardless of append order. The full event is stored as JSON and
 *   re-parsed with the core `RunEvent` schema on read (code.md rule 4).
 *
 * Exports: createRunEventRepository().
 * Depends on: @forge/core, shared/json, types/storage-driver.types.
 */

import { RunEvent } from '@forge/core';
import type { RunEventRepository } from '@forge/core';
import { fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

export function createRunEventRepository(driver: SqlDriver): RunEventRepository {
  return {
    async append(runId, event) {
      const e = RunEvent.parse(event);
      driver.run(
        'INSERT INTO run_events (run_id, seq, ts, kind, payload_json) VALUES (?, ?, ?, ?, ?)',
        [runId, e.seq, e.ts, e.type, toJson(e)],
      );
    },

    async listByRun(runId, afterSeq) {
      return driver
        .all<{ payload_json: string }>(
          'SELECT payload_json FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq',
          [runId, afterSeq ?? -1],
        )
        .map((r) => RunEvent.parse(fromJson(r.payload_json)));
    },
  };
}

/**
 * SQLite RunEventRepository: the append-only `run_events` log.
 *
 * Why: run_events is the record of what a Worker actually did: the control room's live
 *   view, the replay source, and the evidence gates compare Worker claims against. It
 *   has to be trustworthy, so it is append-only: (run_id, seq) is the primary key, a
 *   repeated seq is rejected by the database, and reads return seq order whatever the
 *   append order. The scheduler never decides from it. Events are stored as JSON and
 *   re-parsed with the core `RunEvent` schema on read, so a corrupt row fails loudly
 *   (director-core.md §3).
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

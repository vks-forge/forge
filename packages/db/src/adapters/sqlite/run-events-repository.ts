/**
 * SQLite RunEventRepository: the append-only `run_events` log.
 *
 * Why: run_events is the record of what a Worker actually did: the control room's live
 *   view, the replay source, and the evidence gates compare Worker claims against. It
 *   has to be trustworthy, so it is append-only: (run_id, seq) is the primary key and
 *   this repository is the only thing that numbers events (max+1 inside the writer's
 *   transaction), so the driver and the MCP server appending to one run can never
 *   collide or leave a gap. Reads return seq order. The scheduler never decides from it. Events are stored as JSON and
 *   re-parsed with the core `RunEvent` schema on read, so a corrupt row fails loudly
 *   (director-core.md §3).
 *
 * Exports: createRunEventRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, shared/run-event,
 *   types/storage-driver.types.
 */

import { RunEvent } from '@forge/core';
import type { RunEventRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { fromJson, toJson } from '#/shared/json.js';
import { normaliseRunEvent } from '#/shared/run-event.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

export function createRunEventRepository(driver: SqlDriver): RunEventRepository {
  return {
    async append(runId, event) {
      // Runs inside the caller's BEGIN IMMEDIATE transaction, so no other writer can take
      // this number between the read and the insert. The caller's own `seq`, if any, is
      // overwritten: storage is the single allocator.
      const head = driver.get<{ next: number }>(
        'SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM run_events WHERE run_id = ?',
        [runId],
      );
      const e = RunEvent.parse({ ...normaliseRunEvent(event), seq: head?.next ?? 0 });
      driver.run(
        'INSERT INTO run_events (run_id, seq, ts, kind, payload_json) VALUES (?, ?, ?, ?, ?)',
        [runId, e.seq, e.ts, e.type, toJson(e)],
      );
      return e;
    },

    async listByRun(runId, afterSeq) {
      return driver
        .all<{ payload_json: string }>(
          'SELECT payload_json FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq',
          [runId, afterSeq ?? -1],
        )
        .map((r) => parseStored(RunEvent, fromJson(r.payload_json), 'run event'));
    },
  };
}

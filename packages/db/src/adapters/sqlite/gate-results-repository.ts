/**
 * SQLite GateResultRepository for the `gate_results` table.
 *
 * Why: independent gates judge a run, but the engine and the Ticket screen ask "what is
 *   the verification state of this ticket", across all its runs, including retries. The
 *   table is keyed by run (that is what a gate verified), so reading per ticket joins
 *   through `runs`; results of a run that has no row are not attributable to any ticket and
 *   are not returned. Verdicts are validated against the closed gate and status sets on
 *   the way in and out, so a gate that does not exist can never read as a pass
 *   (verification-plane.md §1-§2).
 *
 * Exports: createGateResultRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { GateResult, NewGateResult, UnknownForgeError } from '@forge/core';
import type { GateResultRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toGate = (row: SqlRow): GateResult =>
  parseStored(GateResult, dropNulls(row), 'gate result');

export function createGateResultRepository(driver: SqlDriver): GateResultRepository {
  return {
    async insert(result) {
      const g = NewGateResult.parse(result);
      driver.run(
        `INSERT INTO gate_results (run_id, gate, status, report_ref, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          g.run_id,
          g.gate,
          g.status,
          g.report_ref ?? null,
          g.started_at,
          g.ended_at ?? null,
        ],
      );
      const row = driver.get('SELECT * FROM gate_results WHERE id = last_insert_rowid()');
      if (!row) throw new UnknownForgeError('gate result vanished after insert');
      return toGate(row);
    },

    async listByTicket(ticketId) {
      return driver
        .all(
          `SELECT g.* FROM gate_results g JOIN runs r ON r.id = g.run_id
           WHERE r.ticket_id = ? ORDER BY g.id`,
          [ticketId],
        )
        .map(toGate);
    },
  };
}

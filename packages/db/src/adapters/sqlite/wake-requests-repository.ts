/**
 * SQLite WakeRequestRepository for the `wake_requests` table.
 *
 * Why: the Director comes back to a ticket through wake requests, and the same cause is
 *   reported many times (a retry timer firing twice, an answer delivered twice). The table
 *   is unique on (ticket, reason, idempotency key); a duplicate does not queue a second
 *   wake, it bumps `coalesced_count`, so one cause is one run. `countSince` feeds the
 *   automated re-wake cap (at most three recovery wakes per ticket per hour): it counts
 *   distinct requests by their creation time, not duplicates, so a flood of one duplicate
 *   cannot trip the cap and a real loop cannot hide from it (director-core.md §3).
 *
 * Exports: createWakeRequestRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { NewWakeRequest, UnknownForgeError, WakeRequest } from '@forge/core';
import type { WakeRequestRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toWake = (row: SqlRow): WakeRequest =>
  parseStored(WakeRequest, dropNulls(row), 'wake request');

export function createWakeRequestRepository(driver: SqlDriver): WakeRequestRepository {
  return {
    async insertIfNew(request) {
      const w = NewWakeRequest.parse(request);
      const res = driver.run(
        `INSERT INTO wake_requests (id, ticket_id, reason, kind, idempotency_key,
           coalesced_count, status, not_before, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 'pending', ?, ?)
         ON CONFLICT (ticket_id, reason, idempotency_key) DO NOTHING`,
        [
          w.id,
          w.ticket_id,
          w.reason,
          w.kind,
          w.idempotency_key,
          w.not_before ?? null,
          w.created_at,
        ],
      );

      const inserted = res.changes === 1;
      const key = [w.ticket_id, w.reason, w.idempotency_key];
      if (!inserted) {
        driver.run(
          `UPDATE wake_requests SET coalesced_count = coalesced_count + 1
           WHERE ticket_id = ? AND reason = ? AND idempotency_key = ?`,
          key,
        );
      }

      const row = driver.get(
        'SELECT * FROM wake_requests WHERE ticket_id = ? AND reason = ? AND idempotency_key = ?',
        key,
      );

      if (!row) {
        throw new UnknownForgeError('wake request vanished after insert');
      }

      return { inserted, request: toWake(row) };
    },

    async listDue(now) {
      return driver
        .all(
          `SELECT * FROM wake_requests
           WHERE status = 'pending' AND (not_before IS NULL OR not_before <= ?)
           ORDER BY rowid`,
          [now],
        )
        .map(toWake);
    },

    async markConsumed(id, at) {
      const res = driver.run(
        `UPDATE wake_requests SET status = 'consumed', consumed_at = ?
         WHERE id = ? AND status = 'pending'`,
        [at, id],
      );

      return res.changes === 1;
    },

    async countSince(ticketId, since, kinds) {
      if (kinds !== undefined && kinds.length === 0) {
        return 0;
      }

      const kindClause =
        kinds === undefined ? '' : ` AND kind IN (${kinds.map(() => '?').join(', ')})`;

      const row = driver.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM wake_requests WHERE ticket_id = ? AND created_at >= ?${kindClause}`,
        [ticketId, since, ...(kinds ?? [])],
      );

      return row?.n ?? 0;
    },
  };
}

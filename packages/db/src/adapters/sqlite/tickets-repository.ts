/**
 * SQLite TicketRepository with single-statement compare-and-swap.
 *
 * Why: ticket status is the one thing two actors can race on (a Director tick and an API
 *   call, or a gate result and a cancel). `updateTicketCas` is a single `UPDATE ...
 *   WHERE id=? AND status_version=?` and success is `changes === 1`, so the stale writer
 *   loses atomically; a read-then-write would let both succeed and the ticket could be
 *   double-dispatched or moved twice. Rows are re-parsed with the core `Ticket` schema
 *   on read (director-core.md §3).
 *
 * Exports: createTicketRepository().
 * Depends on: @forge/core, shared/json, shared/patches, types/storage-driver.types.
 */

import { Ticket } from '@forge/core';
import type { TicketId, TicketPatch, TicketRepository, TicketStatus } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import { buildSetClause, parseTicketPatch } from '#/shared/patches.js';
import type { ColumnCodec, SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const COLUMNS: Readonly<Record<string, ColumnCodec>> = {
  title: { column: 'title' },
  body: { column: 'body' },
  type: { column: 'type' },
  lane: { column: 'lane' },
  tier_predicted: { column: 'tier_predicted' },
  tier_actual: { column: 'tier_actual', clearable: true },
  status: { column: 'status' },
  status_version: { column: 'status_version' },
  rework_count: { column: 'rework_count' },
  blocked_reason: { column: 'blocked_reason', clearable: true },
  updated_at: { column: 'updated_at' },
  parent: { column: 'parent_id', clearable: true },
  blocked_by: { column: 'blocked_by_json', encode: toJson },
};

function toTicket(row: SqlRow): Ticket {
  const { parent_id, blocked_by_json, ...rest } = dropNulls(row);
  return parseStored(
    Ticket,
    {
      ...rest,
      ...(parent_id === undefined ? {} : { parent: parent_id }),
      blocked_by: fromJson(blocked_by_json) ?? [],
    },
    'ticket',
  );
}

export function createTicketRepository(driver: SqlDriver): TicketRepository {
  return {
    async get(id: TicketId) {
      const row = driver.get('SELECT * FROM tickets WHERE id = ?', [id]);
      return row ? toTicket(row) : null;
    },

    async listByStatus(status: TicketStatus) {
      return driver
        .all('SELECT * FROM tickets WHERE status = ? ORDER BY rowid', [status])
        .map(toTicket);
    },

    async insert(ticket: Ticket) {
      const t = Ticket.parse(ticket);
      driver.run(
        `INSERT INTO tickets (id, project, parent_id, title, body, type, lane, tier_predicted,
           tier_actual, status, status_version, rework_count, blocked_reason, blocked_by_json,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.project,
          t.parent ?? null,
          t.title,
          t.body,
          t.type,
          t.lane,
          t.tier_predicted,
          t.tier_actual ?? null,
          t.status,
          t.status_version,
          t.rework_count,
          t.blocked_reason ?? null,
          toJson(t.blocked_by),
          t.created_at,
          t.updated_at,
        ],
      );
    },

    async updateTicketCas(id: TicketId, expectedVersion: number, patch: TicketPatch) {
      const { sql, params } = buildSetClause(
        COLUMNS,
        parseTicketPatch(expectedVersion, patch),
      );
      const res = driver.run(
        `UPDATE tickets SET ${sql} WHERE id = ? AND status_version = ?`,
        [...params, id, expectedVersion],
      );
      return res.changes === 1;
    },
  };
}

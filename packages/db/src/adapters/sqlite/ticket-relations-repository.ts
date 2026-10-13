/**
 * SQLite TicketRelationRepository for the `ticket_relations` table.
 *
 * Why: this table is the single source of truth for which ticket blocks, depends on or was
 *   spawned from which. `Ticket.parent` and `Ticket.blocked_by` are read from it, so adding
 *   or removing an edge here is what unblocks a ticket; a second copy anywhere else would
 *   let the two disagree and start a ticket whose blocker is still open. The primary key
 *   (from, to, kind) makes adding an edge idempotent, and edges are validated with the core
 *   schema, so a self edge or a malformed id never reaches the table (director-core.md §3).
 *
 * Exports: createTicketRelationRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { TicketRelation } from '@forge/core';
import type { TicketRelationRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

export function createTicketRelationRepository(
  driver: SqlDriver,
): TicketRelationRepository {
  return {
    async add(relation) {
      const r = TicketRelation.parse(relation);
      const res = driver.run(
        `INSERT INTO ticket_relations (from_id, to_id, kind, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [r.from_id, r.to_id, r.kind, r.created_at ?? null],
      );
      return res.changes === 1;
    },

    async remove(fromId, toId, kind) {
      const res = driver.run(
        'DELETE FROM ticket_relations WHERE from_id = ? AND to_id = ? AND kind = ?',
        [fromId, toId, kind],
      );
      return res.changes === 1;
    },

    async listFor(ticketId) {
      return driver
        .all(
          'SELECT from_id, to_id, kind, created_at FROM ticket_relations WHERE from_id = ? OR to_id = ? ORDER BY rowid',
          [ticketId, ticketId],
        )
        .map((row) => parseStored(TicketRelation, dropNulls(row), 'ticket relation'));
    },
  };
}

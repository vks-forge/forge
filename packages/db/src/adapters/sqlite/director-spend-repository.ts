/**
 * SQLite repository for the Director spend ledger.
 *
 * Why: the Director's steps cost money that no run records, and Cost, Overview and the ticket page
 *   must add it to the Workers' spend by day, project and ticket. Rows are append-only, so a total
 *   can never drift: a correction is a new row, never an edit. Every row is parsed with the core
 *   schema on the way in (a negative or unpriced amount cannot be stored as a guess) and on the way
 *   out. Totals are summed in SQL so the Board and card pages stay cheap on a long history.
 *
 * Exports: createDirectorSpendRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { DirectorSpend, NewDirectorSpend } from '@forge/core';
import type { DirectorSpendRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow, SqlValue } from '#/types/storage-driver.types.js';

const COLUMNS = 'id, project, card_id, ticket_id, kind, model, usd, recorded, at';

const toRow = (row: SqlRow): DirectorSpend =>
  parseStored(
    DirectorSpend,
    dropNulls({ ...row, recorded: row['recorded'] === 1 }),
    'director spend',
  );

export function createDirectorSpendRepository(
  driver: SqlDriver,
): DirectorSpendRepository {
  return {
    async append(input) {
      const row = NewDirectorSpend.parse(input);

      driver.run(
        `INSERT INTO director_spend (project, card_id, ticket_id, kind, model, usd, recorded, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.project,
          row.card_id ?? null,
          row.ticket_id ?? null,
          row.kind,
          row.model ?? null,
          row.usd,
          row.recorded ? 1 : 0,
          row.at,
        ],
      );

      const id = driver.get<{ id: number }>('SELECT last_insert_rowid() AS id')?.id;
      const stored = driver.get(`SELECT ${COLUMNS} FROM director_spend WHERE id = ?`, [
        id as number,
      ]);

      if (!stored) {
        throw new Error('director spend row vanished after insert');
      }

      return toRow(stored);
    },

    async listByProject(project, window = {}) {
      const where = ['project = ?'];
      const params: SqlValue[] = [project];

      if (window.from !== undefined) {
        where.push('at >= ?');
        params.push(window.from);
      }

      if (window.to !== undefined) {
        where.push('at <= ?');
        params.push(window.to);
      }

      return driver
        .all(
          `SELECT ${COLUMNS} FROM director_spend WHERE ${where.join(' AND ')} ORDER BY at, id`,
          params,
        )
        .map(toRow);
    },

    async totalByCard(cardId) {
      const row = driver.get<{ total: number | null }>(
        'SELECT SUM(usd) AS total FROM director_spend WHERE card_id = ?',
        [cardId],
      );

      return row?.total ?? 0;
    },

    async totalByTicket(ticketIds) {
      const out: Record<string, number> = {};
      if (ticketIds.length === 0) {
        return out;
      }

      const marks = ticketIds.map(() => '?').join(', ');
      const rows = driver.all<{ ticket_id: string; total: number }>(
        `SELECT ticket_id, SUM(usd) AS total FROM director_spend
          WHERE ticket_id IN (${marks}) GROUP BY ticket_id`,
        [...ticketIds],
      );

      for (const r of rows) {
        out[r.ticket_id] = r.total;
      }

      return out;
    },
  };
}

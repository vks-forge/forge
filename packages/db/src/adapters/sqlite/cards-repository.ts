/**
 * SQLite CardRepository for the `cards` table.
 *
 * Why: the card is the record of an intake and the parent of its tickets (d-0105). Rows are
 *   re-parsed with the core `Card` schema on read, so a hand-edited or half-migrated row
 *   cannot reach the Board unvalidated. Numbering is storage's job: the highest stored
 *   `<PREFIX>-C<n>` plus one, read inside the caller's single-writer transaction, so two
 *   intakes cannot take the same number. The rolled-up column is not stored here.
 *
 * Exports: createCardRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { Card, InvalidInputError } from '@forge/core';
import type { CardRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow, SqlValue } from '#/types/storage-driver.types.js';

const toCard = (row: SqlRow): Card => {
  const { source_kind, source_ref, created_by_type, created_by_id, ...rest } =
    dropNulls(row);

  return parseStored(
    Card,
    {
      ...rest,
      source: { kind: source_kind, ref: source_ref },
      created_by: { type: created_by_type, id: created_by_id },
    },
    'card',
  );
};

const CLEARABLE = ['closed_reason', 'budget_cap_usd'] as const;
const SETTABLE = ['type', 'title', 'summary', ...CLEARABLE] as const;

export function createCardRepository(driver: SqlDriver): CardRepository {
  return {
    async get(id) {
      const row = driver.get('SELECT * FROM cards WHERE id = ?', [id]);

      return row ? toCard(row) : null;
    },

    async insert(card) {
      const c = Card.parse(card);
      driver.run(
        `INSERT INTO cards (id, project, type, title, summary, source_kind, source_ref,
           created_by_type, created_by_id, created_at, updated_at, closed_reason, budget_cap_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          c.project,
          c.type,
          c.title,
          c.summary,
          c.source.kind,
          c.source.ref,
          c.created_by.type,
          c.created_by.id,
          c.created_at,
          c.updated_at,
          c.closed_reason ?? null,
          c.budget_cap_usd ?? null,
        ],
      );
    },

    async nextNumber(prefix) {
      // `<prefix>-C` is prefix.length + 2 characters, so the number starts at +3 (1-based).
      const head = driver.get<{ next: number }>(
        `SELECT COALESCE(MAX(CAST(substr(id, ?) AS INTEGER)), 0) + 1 AS next
         FROM cards WHERE id LIKE ?`,
        [prefix.length + 3, `${prefix}-C%`],
      );

      return head?.next ?? 1;
    },

    async listByProject(project, filter) {
      const where = ['project = ?'];
      const params: SqlValue[] = [project];
      if (filter.type !== undefined) {
        where.push('type = ?');
        params.push(filter.type);
      }

      if (filter.after) {
        where.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
        params.push(filter.after.updated_at, filter.after.updated_at, filter.after.id);
      }

      return driver
        .all(
          `SELECT * FROM cards WHERE ${where.join(' AND ')}
           ORDER BY updated_at DESC, id DESC LIMIT ?`,
          [...params, filter.limit],
        )
        .map(toCard);
    },

    async update(id, patch) {
      const sets = ['updated_at = ?'];
      const params: SqlValue[] = [patch.updated_at];
      for (const key of SETTABLE) {
        if (!(key in patch)) {
          continue;
        }

        const value = patch[key];
        if (value !== undefined) {
          sets.push(`${key} = ?`);
          params.push(value);
        } else if ((CLEARABLE as readonly string[]).includes(key)) {
          sets.push(`${key} = NULL`);
        } else {
          throw new InvalidInputError(`card ${key} cannot be cleared`);
        }
      }

      const res = driver.run(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`, [
        ...params,
        id,
      ]);

      return res.changes === 1;
    },
  };
}

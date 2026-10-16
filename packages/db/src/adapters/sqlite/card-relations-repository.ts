/**
 * SQLite CardRelationRepository for the `card_relations` table.
 *
 * Why: this table is the one source of truth for which card waits for which (d-0141 item 2):
 *   "blocks" is just the reverse view of the same edge, so the create-card form, the card
 *   page and the Board can never disagree about order. The cycle check reads every edge of
 *   a project at once, and an edit replaces a card's edges in one step inside the caller's
 *   transaction, so a half-applied edit cannot leave a loop the check never saw. Edges are
 *   validated with the core schema, so a self edge or a malformed id never reaches the
 *   table; "same project" is the caller's rule, not enforced here.
 *
 * Exports: createCardRelationRepository().
 * Depends on: @forge/core, shared/db-errors, types/storage-driver.types.
 */

import { CardRelation, InvalidInputError } from '@forge/core';
import type { CardRelationRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toRelation = (row: SqlRow): CardRelation =>
  parseStored(
    CardRelation,
    { from: row['from_card'], to: row['to_card'], kind: row['kind'] },
    'card relation',
  );

function insertEdge(driver: SqlDriver, edge: CardRelation, at: string): boolean {
  const r = CardRelation.parse(edge);
  if (r.from === r.to) {
    throw new InvalidInputError(`card ${r.from} cannot depend on itself`);
  }

  const res = driver.run(
    `INSERT INTO card_relations (from_card, to_card, kind, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (from_card, to_card, kind) DO NOTHING`,
    [r.from, r.to, r.kind, at],
  );

  return res.changes === 1;
}

export function createCardRelationRepository(driver: SqlDriver): CardRelationRepository {
  return {
    async listByProject(project) {
      return driver
        .all(
          `SELECT r.from_card, r.to_card, r.kind FROM card_relations r
           JOIN cards c ON c.id = r.from_card WHERE c.project = ? ORDER BY r.rowid`,
          [project],
        )
        .map(toRelation);
    },

    async listFor(cardId) {
      return driver
        .all(
          `SELECT from_card, to_card, kind FROM card_relations
           WHERE from_card = ? OR to_card = ? ORDER BY rowid`,
          [cardId, cardId],
        )
        .map(toRelation);
    },

    async replaceFor(cardId, dependsOn, blocks, at) {
      // Validate every edge before the first write: a refused edge must leave the old set intact.
      const edges: CardRelation[] = [
        ...dependsOn.map((to) => ({ from: cardId, to, kind: 'depends_on' as const })),
        ...blocks.map((from) => ({ from, to: cardId, kind: 'depends_on' as const })),
      ];

      for (const edge of edges) {
        if (CardRelation.parse(edge).from === edge.to) {
          throw new InvalidInputError(`card ${edge.from} cannot depend on itself`);
        }
      }

      driver.run('DELETE FROM card_relations WHERE from_card = ? OR to_card = ?', [
        cardId,
        cardId,
      ]);

      for (const edge of edges) {
        insertEdge(driver, edge, at);
      }
    },

    async add(relation, at) {
      return insertEdge(driver, relation, at);
    },
  };
}

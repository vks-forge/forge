/**
 * SQLite repository for a card's checked evidence.
 *
 * Why: the Evidence tab, the plan's verification section and the approval floor all read the same rows:
 *   the engine's checked claims, each with the quotes that really matched a fetched page, the sources they
 *   sit in and a status the model never set (d-0144). Refs (`E1`, `E2`, ...) are numbered per card by
 *   storage alone, inside the caller's transaction, and unique per card, so evidence written in two
 *   research runs of one card never collides. Evidence is plain rows, never a vector store (r-0001). Every
 *   value is parsed with the core schema both ways, so a row this version cannot read fails closed.
 *
 * Exports: createEvidenceRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { Evidence } from '@forge/core';
import type { EvidenceRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toEvidence = (row: SqlRow): Evidence => {
  const { quotes_json: quotes, sources_json: sources, ...rest } = row;

  return parseStored(
    Evidence,
    { ...dropNulls(rest), quotes: fromJson(quotes), sources: fromJson(sources) },
    'evidence',
  );
};

export function createEvidenceRepository(driver: SqlDriver): EvidenceRepository {
  const list = (cardId: string): Evidence[] =>
    driver
      .all(
        'SELECT * FROM card_evidence WHERE card_id = ? ORDER BY CAST(SUBSTR(ref, 2) AS INTEGER)',
        [cardId],
      )
      .map(toEvidence);

  return {
    async insertMany(cardId, rows) {
      const max =
        driver.get<{ n: number | null }>(
          'SELECT MAX(CAST(SUBSTR(ref, 2) AS INTEGER)) AS n FROM card_evidence WHERE card_id = ?',
          [cardId],
        )?.n ?? 0;

      const written = rows.map((r, i) => {
        const ref = `E${max + i + 1}`;
        const checked = Evidence.omit({ id: true }).parse({ ...r, card_id: cardId, ref });
        driver.run(
          `INSERT INTO card_evidence
             (card_id, ref, step_id, origin, question, claim, quotes_json, sources_json, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cardId,
            ref,
            checked.step_id,
            checked.origin,
            checked.question ?? null,
            checked.claim,
            toJson(checked.quotes),
            toJson(checked.sources),
            checked.status,
            checked.created_at,
          ],
        );

        return ref;
      });

      const stored = new Set(written);

      return list(cardId).filter((e) => stored.has(e.ref));
    },

    async listByCard(cardId) {
      return list(cardId);
    },

    async count(cardId, origin) {
      const row =
        origin === undefined
          ? driver.get<{ n: number }>(
              'SELECT COUNT(*) AS n FROM card_evidence WHERE card_id = ?',
              [cardId],
            )
          : driver.get<{ n: number }>(
              'SELECT COUNT(*) AS n FROM card_evidence WHERE card_id = ? AND origin = ?',
              [cardId, origin],
            );

      return row?.n ?? 0;
    },
  };
}

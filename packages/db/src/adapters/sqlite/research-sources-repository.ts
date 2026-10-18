/**
 * SQLite repository for fetched research sources.
 *
 * Why: the research step's model reads pages written by strangers; the engine decides what counts as
 *   evidence by checking quotes against the stored page text (d-0144, d-0001). Each page is stored once as a
 *   row with its capped text and the hash of the full page. A card's sources carry its own numbering
 *   (`S1`, `S2`, ...) and a unique (card, ref) index, so a research step that reruns after a restart cannot
 *   produce a second `S1`; a Worker's sources have no card ref and are found by run, so `submit_review` can
 *   check a finding's cited URLs against what the run really fetched. The text is cut to a fixed number of
 *   characters here, in one place, so the database cannot grow without bound from one hostile page.
 *
 * Exports: createResearchSourceRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { MAX_SOURCE_TEXT_CHARS, ResearchSource } from '@forge/core';
import type { ResearchSourceRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const MAX_TITLE = 300;

const COLUMNS = `id, project, card_id, ticket_id, run_id, ref, origin, url, final_url, title,
  retrieved_at, sha256, bytes, truncated`;

const toSource = (row: SqlRow): ResearchSource =>
  parseStored(
    ResearchSource,
    dropNulls({ ...row, text: undefined, truncated: row['truncated'] === 1 }),
    'research source',
  );

export function createResearchSourceRepository(
  driver: SqlDriver,
): ResearchSourceRepository {
  const byId = (id: number): ResearchSource => {
    const row = driver.get(`SELECT ${COLUMNS} FROM research_sources WHERE id = ?`, [id]);
    if (!row) {
      throw new Error('research source vanished after insert');
    }

    return toSource(row);
  };

  return {
    async insert(source) {
      const text = source.text.slice(0, MAX_SOURCE_TEXT_CHARS);
      const row = ResearchSource.omit({ id: true }).parse({
        ...source,
        title: source.title.slice(0, MAX_TITLE),
        truncated: source.truncated || text.length < source.text.length,
        text: undefined,
      });

      driver.run(
        `INSERT INTO research_sources
           (project, card_id, ticket_id, run_id, ref, origin, url, final_url, title,
            retrieved_at, sha256, bytes, truncated, text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.project,
          row.card_id ?? null,
          row.ticket_id ?? null,
          row.run_id ?? null,
          row.ref ?? null,
          row.origin,
          row.url,
          row.final_url,
          row.title,
          row.retrieved_at,
          row.sha256,
          row.bytes,
          row.truncated ? 1 : 0,
          text,
        ],
      );

      const id = driver.get<{ id: number }>('SELECT last_insert_rowid() AS id')?.id;

      return byId(id as number);
    },

    async nextRef(cardId) {
      const max = driver.get<{ n: number | null }>(
        `SELECT MAX(CAST(SUBSTR(ref, 2) AS INTEGER)) AS n FROM research_sources WHERE card_id = ?`,
        [cardId],
      )?.n;

      return `S${(max ?? 0) + 1}`;
    },

    async listByCard(cardId) {
      return driver
        .all(
          `SELECT ${COLUMNS} FROM research_sources WHERE card_id = ?
            ORDER BY CAST(SUBSTR(ref, 2) AS INTEGER)`,
          [cardId],
        )
        .map(toSource);
    },

    async listByRun(runId) {
      return driver
        .all(`SELECT ${COLUMNS} FROM research_sources WHERE run_id = ? ORDER BY id`, [
          runId,
        ])
        .map(toSource);
    },

    async text(id) {
      const row = driver.get('SELECT text FROM research_sources WHERE id = ?', [id]);

      return row ? String(row['text']) : null;
    },

    async getByRef(cardId, ref) {
      const row = driver.get(
        `SELECT ${COLUMNS}, text FROM research_sources WHERE card_id = ? AND ref = ?`,
        [cardId, ref],
      );

      return row ? { source: toSource(row), text: String(row['text']) } : null;
    },
  };
}

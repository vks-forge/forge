/**
 * SQLite InteractionRepository for blocking questions and approvals.
 *
 * Why: a parked ticket needs a durable reason to wait (director-core.md §3 invariant,
 *   §8); `listPending` is how the Director finds them. Payload and answer are JSON,
 *   rows are parsed with the core `Interaction` schema (code.md rule 4).
 *
 * Exports: createInteractionRepository().
 * Depends on: @forge/core, shared/json, shared/patches, types/storage-driver.types.
 */

import { Interaction, UnknownForgeError } from '@forge/core';
import type { InteractionRepository } from '@forge/core';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import { buildSetClause, parseInteractionPatch } from '#/shared/patches.js';
import type { ColumnCodec, SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const COLUMNS: Readonly<Record<string, ColumnCodec>> = {
  ticket_id: { column: 'ticket_id' },
  run_id: { column: 'run_id' },
  kind: { column: 'kind' },
  payload: { column: 'payload_json', encode: toJson },
  status: { column: 'status' },
  asked_at: { column: 'asked_at' },
  answered_at: { column: 'answered_at' },
  timeout_at: { column: 'timeout_at' },
  answer: { column: 'answer_json', encode: toJson },
};

function toInteraction(row: SqlRow): Interaction {
  const { payload_json, answer_json, ...rest } = dropNulls(row);
  return Interaction.parse({
    ...rest,
    payload: fromJson(payload_json),
    ...(answer_json === undefined ? {} : { answer: fromJson(answer_json) }),
  });
}

export function createInteractionRepository(driver: SqlDriver): InteractionRepository {
  return {
    async get(id) {
      const row = driver.get('SELECT * FROM interactions WHERE id = ?', [id]);
      return row ? toInteraction(row) : null;
    },

    async listPending() {
      return driver
        .all(
          "SELECT * FROM interactions WHERE status = 'pending' ORDER BY asked_at, rowid",
        )
        .map(toInteraction);
    },

    async insert(interaction) {
      const i = Interaction.parse(interaction);
      driver.run(
        `INSERT INTO interactions (id, ticket_id, run_id, kind, payload_json, status, asked_at,
           answered_at, timeout_at, answer_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          i.id,
          i.ticket_id,
          i.run_id ?? null,
          i.kind,
          toJson(i.payload),
          i.status,
          i.asked_at,
          i.answered_at ?? null,
          i.timeout_at,
          i.answer === undefined ? null : toJson(i.answer),
        ],
      );
    },

    async update(id, patch) {
      const { sql, params } = buildSetClause(COLUMNS, parseInteractionPatch(patch));
      if (sql === '') return;
      const res = driver.run(`UPDATE interactions SET ${sql} WHERE id = ?`, [
        ...params,
        id,
      ]);
      if (res.changes !== 1) throw new UnknownForgeError(`Interaction not found: ${id}`);
    },
  };
}

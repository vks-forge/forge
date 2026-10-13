/**
 * SQLite InteractionRepository for blocking questions and approvals.
 *
 * Why: when a Worker asks a human something the ticket parks in WaitingHuman, and the
 *   question must survive a Director restart. This repository stores the question, its
 *   timeout and the eventual answer, and `listPending` is how each tick finds parked
 *   tickets to wake when answered or time out to Blocked. Resolving is a compare-and-swap:
 *   `answer` and `expire` are one `UPDATE ... WHERE status = 'pending'`, so a human and a
 *   timeout (or two tabs) cannot both win, and the loser learns it lost instead of
 *   overwriting the winner. Without it a parked ticket is invisible and the "every open
 *   ticket has a reason to wait" invariant cannot be enforced. Payload and answer are
 *   free-form JSON, so rows are re-parsed with the core `Interaction` schema on read
 *   (director-core.md §3, §8).
 *
 * Exports: createInteractionRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, shared/patches, types/storage-driver.types.
 */

import { Interaction, UnknownForgeError } from '@forge/core';
import type { InteractionRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import { buildSetClause, parseInteractionPatch } from '#/shared/patches.js';
import type { ColumnCodec, SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const COLUMNS: Readonly<Record<string, ColumnCodec>> = {
  ticket_id: { column: 'ticket_id' },
  run_id: { column: 'run_id', clearable: true },
  kind: { column: 'kind' },
  payload: { column: 'payload_json', encode: toJson },
  status: { column: 'status' },
  asked_at: { column: 'asked_at' },
  answered_at: { column: 'answered_at', clearable: true },
  timeout_at: { column: 'timeout_at' },
  answer: { column: 'answer_json', encode: toJson, clearable: true },
};

function toInteraction(row: SqlRow): Interaction {
  const { payload_json, answer_json, ...rest } = dropNulls(row);
  return parseStored(
    Interaction,
    {
      ...rest,
      payload: fromJson(payload_json),
      ...(answer_json === undefined ? {} : { answer: fromJson(answer_json) }),
    },
    'interaction',
  );
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

    async listByTicket(ticketId) {
      return driver
        .all('SELECT * FROM interactions WHERE ticket_id = ? ORDER BY asked_at, rowid', [
          ticketId,
        ])
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

    async answer(id, answer, at) {
      const res = driver.run(
        `UPDATE interactions SET status = 'answered', answer_json = ?, answered_at = ?
         WHERE id = ? AND status = 'pending'`,
        [toJson(answer), at, id],
      );
      return res.changes === 1;
    },

    async expire(id, at) {
      const res = driver.run(
        `UPDATE interactions SET status = 'timed_out'
         WHERE id = ? AND status = 'pending' AND timeout_at <= ?`,
        [id, at],
      );
      return res.changes === 1;
    },
  };
}

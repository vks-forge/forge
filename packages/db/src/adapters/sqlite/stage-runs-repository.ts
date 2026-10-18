/**
 * SQLite StageRunRepository for the `stage_runs` table.
 *
 * Why: the stage runner keeps no cursor, so these rows are the only account of where a ticket's
 *   pipeline stands. A row is one stage attempt, unique per (ticket, stage, group member, rework
 *   cycle): `start` reports `'exists'` instead of inserting a second one, which is what makes a
 *   double tick or a restart start nothing twice. An attempt is looked up by the run that carries
 *   it (a settled check run finds its stage this way) read by id, or listed per ticket for the cursor. The
 *   outcome is parsed with the core schema both ways, so an attempt this version cannot read
 *   fails closed. `finish` changes only the keys it is given.
 *
 * Exports: createStageRunRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { StageOutcome, StageRun, UnknownForgeError } from '@forge/core';
import type { StageRunRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow, SqlValue } from '#/types/storage-driver.types.js';

const MAX_BATCH = 500;

const toRun = (row: SqlRow): StageRun => {
  const { outcome_json: outcomeJson, ...rest } = row;

  return parseStored(
    StageRun,
    {
      ...dropNulls(rest),
      outcome: parseStored(StageOutcome, fromJson(outcomeJson), 'stage outcome'),
    },
    'stage run',
  );
};

export function createStageRunRepository(driver: SqlDriver): StageRunRepository {
  return {
    async start(row) {
      // INSERT OR IGNORE would also swallow a CHECK failure and read as `exists`, so the row is validated first.
      const outcome = StageOutcome.parse(row.outcome ?? {});
      StageRun.parse({ ...row, outcome, id: 1 });
      const { changes } = driver.run(
        `INSERT OR IGNORE INTO stage_runs
           (ticket_id, stage_id, member_id, cycle, kind, agent_id, agent_hash, run_id, status, outcome_json, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.ticket_id,
          row.stage_id,
          row.member_id,
          row.cycle,
          row.kind,
          row.agent_id ?? null,
          row.agent_hash ?? null,
          row.run_id ?? null,
          row.status,
          toJson(outcome),
          row.started_at,
        ],
      );

      if (changes === 0) {
        return 'exists';
      }

      const id = driver.get<{ id: number }>('SELECT last_insert_rowid() AS id')?.id;
      if (id === undefined) {
        throw new UnknownForgeError('stage run vanished after insert');
      }

      return id;
    },

    async find(ticketId, stageId, memberId, cycle) {
      const row = driver.get(
        `SELECT * FROM stage_runs
          WHERE ticket_id = ? AND stage_id = ? AND member_id = ? AND cycle = ?`,
        [ticketId, stageId, memberId, cycle],
      );

      return row ? toRun(row) : null;
    },

    async get(id) {
      const row = driver.get('SELECT * FROM stage_runs WHERE id = ?', [id]);

      return row ? toRun(row) : null;
    },

    async listByTicket(ticketId) {
      return driver
        .all('SELECT * FROM stage_runs WHERE ticket_id = ? ORDER BY id', [ticketId])
        .map(toRun);
    },

    async listByTickets(ticketIds) {
      if (ticketIds.length === 0) {
        return [];
      }

      if (ticketIds.length > MAX_BATCH) {
        throw new UnknownForgeError(`at most ${MAX_BATCH} tickets per read`);
      }

      return driver
        .all(
          `SELECT * FROM stage_runs WHERE ticket_id IN (${ticketIds.map(() => '?').join(', ')}) ORDER BY id`,
          [...ticketIds],
        )
        .map(toRun);
    },

    async getByRun(runId) {
      const row = driver.get(
        'SELECT * FROM stage_runs WHERE run_id = ? ORDER BY id DESC LIMIT 1',
        [runId],
      );

      return row ? toRun(row) : null;
    },

    async finish(id, patch) {
      const sets: string[] = [];
      const params: SqlValue[] = [];
      const set = (column: string, value: SqlValue): void => {
        sets.push(`${column} = ?`);
        params.push(value);
      };

      if (patch.status !== undefined) {
        set('status', patch.status);
      }

      if (patch.outcome !== undefined) {
        set('outcome_json', toJson(StageOutcome.parse(patch.outcome)));
      }

      if (patch.run_id !== undefined) {
        set('run_id', patch.run_id);
      }

      if (patch.agent_id !== undefined) {
        set('agent_id', patch.agent_id);
      }

      if (patch.agent_hash !== undefined) {
        set('agent_hash', patch.agent_hash);
      }

      if (patch.started_at !== undefined) {
        set('started_at', patch.started_at);
      }

      if (patch.ended_at !== undefined) {
        set('ended_at', patch.ended_at);
      }

      if (sets.length === 0) {
        return;
      }

      const { changes } = driver.run(
        `UPDATE stage_runs SET ${sets.join(', ')} WHERE id = ?`,
        [...params, id],
      );

      if (changes === 0) {
        throw new UnknownForgeError(`stage run ${id} does not exist`);
      }
    },
  };
}

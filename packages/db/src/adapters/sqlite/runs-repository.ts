/**
 * SQLite RunRepository for the `runs` table.
 *
 * Why: a run row is the Director's account of one Worker attempt: which harness and
 *   session, which server instance owns it, what it cost, how it ended and with which error
 *   family. Reconciliation reads it to detect stalls and settle finished runs (`listByStatus`
 *   is its scan), and retry logic follows `retry_of` and `error_family`. A run that has an
 *   end time is never reopened: clearing `ended_at` or moving it back to `starting` /
 *   `running` is refused, because the end time and chain hash of the first attempt are
 *   evidence; a retry after a failure is a new row (`retry_of`). A run interrupted by a
 *   restart is the one exception to "one row per attempt": it is resumed on the same row,
 *   `generation` counting the run secret generations, and the moves into and out of
 *   `interrupted` follow the core run transition table. Rows are re-parsed with the core `Run`
 *   schema on read, so a half-written or drifted row cannot reach the retry logic
 *   (execution-plane.md §8).
 *
 * Exports: createRunRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, shared/patches, types/storage-driver.types.
 */

import { Run, UnknownForgeError } from '@forge/core';
import type { RunRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import {
  assertInterruptMove,
  assertNotReopened,
  buildSetClause,
  parseRunPatch,
} from '#/shared/patches.js';
import type { ColumnCodec, SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const MAX_BATCH = 500;

const COLUMNS: Readonly<Record<string, ColumnCodec>> = {
  ticket_id: { column: 'ticket_id' },
  project: { column: 'project', clearable: true },
  harness: { column: 'harness' },
  driver_version: { column: 'driver_version' },
  session_ref: { column: 'session_ref', clearable: true },
  cwd: { column: 'cwd' },
  lane: { column: 'lane' },
  started_at: { column: 'started_at' },
  ended_at: { column: 'ended_at', clearable: true },
  status: { column: 'status' },
  usage: { column: 'usage_json', encode: toJson, clearable: true },
  cost_usd: { column: 'cost_usd', clearable: true },
  error_family: { column: 'error_family', clearable: true },
  retry_of: { column: 'retry_of', clearable: true },
  owner: { column: 'owner' },
  pid: { column: 'pid', clearable: true },
  last_event_at: { column: 'last_event_at', clearable: true },
  final_chain_hash: { column: 'final_chain_hash', clearable: true },
  catalogue_hash: { column: 'catalogue_hash', clearable: true },
  prompt_hash: { column: 'prompt_hash', clearable: true },
  config_version: { column: 'config_version', clearable: true },
  agent_id: { column: 'agent_id', clearable: true },
  agent_hash: { column: 'agent_hash', clearable: true },
  model: { column: 'model', clearable: true },
  fallback_slot: { column: 'fallback_slot', clearable: true },
  hook_registered_at: { column: 'hook_registered_at', clearable: true },
  generation: { column: 'generation' },
  resumable_session: { column: 'resumable_session', clearable: true },
  interrupted_at: { column: 'interrupted_at', clearable: true },
};

function toRun(row: SqlRow): Run {
  const { usage_json, ...rest } = dropNulls(row);

  return parseStored(
    Run,
    {
      ...rest,
      ...(usage_json === undefined ? {} : { usage: fromJson(usage_json) }),
    },
    'run',
  );
}

export function createRunRepository(driver: SqlDriver): RunRepository {
  return {
    async get(id) {
      const row = driver.get('SELECT * FROM runs WHERE id = ?', [id]);

      return row ? toRun(row) : null;
    },

    async listByTicket(ticketId) {
      return driver
        .all('SELECT * FROM runs WHERE ticket_id = ? ORDER BY rowid', [ticketId])
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
          `SELECT * FROM runs WHERE ticket_id IN (${ticketIds.map(() => '?').join(', ')}) ORDER BY rowid`,
          [...ticketIds],
        )
        .map(toRun);
    },

    async listByStatus(statuses) {
      if (statuses.length === 0) {
        return [];
      }

      const marks = statuses.map(() => '?').join(', ');

      return driver
        .all(`SELECT * FROM runs WHERE status IN (${marks}) ORDER BY rowid`, [
          ...statuses,
        ])
        .map(toRun);
    },

    async list(filter) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (filter.project !== undefined) {
        where.push('ticket_id IN (SELECT id FROM tickets WHERE project = ?)');
        params.push(filter.project);
      }

      const statuses = filter.statuses ?? [];
      if (statuses.length > 0) {
        where.push(`status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      }

      if (filter.since !== undefined) {
        where.push('started_at >= ?');
        params.push(filter.since);
      }

      if (filter.after) {
        where.push('(started_at < ? OR (started_at = ? AND id < ?))');
        params.push(filter.after.started_at, filter.after.started_at, filter.after.id);
      }

      return driver
        .all(
          `SELECT * FROM runs ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY started_at DESC, id DESC LIMIT ?`,
          [...params, filter.limit],
        )
        .map(toRun);
    },

    async costByTicket(ticketIds) {
      if (ticketIds.length === 0) {
        return {};
      }

      const rows = driver.all<{ id: string; spent: number }>(
        `SELECT ticket_id AS id, SUM(cost_usd) AS spent FROM runs
         WHERE ticket_id IN (${ticketIds.map(() => '?').join(', ')}) AND cost_usd IS NOT NULL
         GROUP BY ticket_id`,
        [...ticketIds],
      );

      return Object.fromEntries(rows.map((r) => [r.id, r.spent]));
    },

    async costByCard(cardIds) {
      if (cardIds.length === 0) {
        return {};
      }

      const rows = driver.all<{ id: string; spent: number }>(
        `SELECT t.card_id AS id, SUM(r.cost_usd) AS spent
         FROM runs r JOIN tickets t ON t.id = r.ticket_id
         WHERE t.card_id IN (${cardIds.map(() => '?').join(', ')}) AND r.cost_usd IS NOT NULL
         GROUP BY t.card_id`,
        [...cardIds],
      );

      return Object.fromEntries(rows.map((r) => [r.id, r.spent]));
    },

    async insert(run) {
      const r = Run.parse(run);
      driver.run(
        `INSERT INTO runs (id, ticket_id, project, harness, driver_version, session_ref, cwd, lane,
           started_at, ended_at, status, usage_json, cost_usd, error_family, retry_of, owner,
           pid, last_event_at, final_chain_hash, catalogue_hash, prompt_hash, config_version, agent_id, agent_hash, model, fallback_slot, hook_registered_at,
           generation, resumable_session, interrupted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id,
          r.ticket_id,
          r.project ?? null,
          r.harness,
          r.driver_version,
          r.session_ref ?? null,
          r.cwd,
          r.lane,
          r.started_at,
          r.ended_at ?? null,
          r.status,
          r.usage === undefined ? null : toJson(r.usage),
          r.cost_usd ?? null,
          r.error_family ?? null,
          r.retry_of ?? null,
          r.owner,
          r.pid ?? null,
          r.last_event_at ?? null,
          r.final_chain_hash ?? null,
          r.catalogue_hash ?? null,
          r.prompt_hash ?? null,
          r.config_version ?? null,
          r.agent_id ?? null,
          r.agent_hash ?? null,
          r.model ?? null,
          r.fallback_slot ?? null,
          r.hook_registered_at ?? null,
          r.generation ?? 1,
          r.resumable_session ?? null,
          r.interrupted_at ?? null,
        ],
      );
    },

    async update(id, patch) {
      const parsed = parseRunPatch(patch);
      const current = driver.get<{ ended_at: string | null; status: Run['status'] }>(
        'SELECT ended_at, status FROM runs WHERE id = ?',
        [id],
      );

      if (!current) {
        throw new UnknownForgeError(`Run not found: ${id}`);
      }

      assertNotReopened(id, current.ended_at !== null, parsed);
      assertInterruptMove(id, current.status, parsed);
      const { sql, params } = buildSetClause(COLUMNS, parsed);
      if (sql === '') {
        return;
      }

      driver.run(`UPDATE runs SET ${sql} WHERE id = ?`, [...params, id]);
    },
  };
}

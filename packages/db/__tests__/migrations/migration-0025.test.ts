/**
 * Pins what migration 0025 adds for the stage runner and how it treats existing data.
 *
 * Why: tickets now pass through the stages of their lane pipeline, and a restarted server must
 *   find each one exactly where it was from three tables: the ticket's own copy of its pipeline,
 *   one row per stage attempt (unique per ticket, stage, member and cycle, which is what stops a
 *   double tick or a restart starting a stage twice) and the artifacts a stage was shown. The
 *   CHECK lists are copied into the SQL because a shipped migration must never change with a
 *   later edit of a core constant, so they are pinned equal to core's lists at this version. An
 *   upgrade must leave existing tickets and wakes readable, and the new `stage` wake kind must be
 *   storable without rebuilding the wake table.
 *
 * Pins: the three tables and their columns, the unique key and both indexes, the CHECK lists at version 25
 *   (lanes and statuses equal core's, kinds the literal 0025 sets; later migrations widen them), a duplicate attempt refused,
 *   existing tickets and wakes untouched, a `stage` wake accepted and read back, and that
 *   storage reads an upgraded database.
 * Depends on: src/index, @forge/core, vitest. IO: in-memory SQLite.
 */

import { Lane, STAGE_RUN_STATUSES } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  createStorageOnDriver,
  openSqliteDriver,
  runMigrations,
} from '#/index.js';
import type { SqlDriver } from '#/index.js';

const STAMP = '2026-10-13T00:00:00.000Z';

const ticket = (id: string): string =>
  `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status,
     status_version, created_at, updated_at)
   VALUES ('${id}', 'sf', 't', 'b', 'feat', 'express', 'A', 'in_progress', 0, '${STAMP}', '${STAMP}')`;

const columns = (driver: SqlDriver, table: string): string[] =>
  driver.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);

/** The words listed in the CHECK of `column` in the SQL that created `table`. */
function checkList(driver: SqlDriver, table: string, column: string): string[] {
  const sql =
    driver.get<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE name = '${table}'`)
      ?.sql ?? '';

  const match = new RegExp(
    `${column}\\s+TEXT[^,]*?CHECK \\(${column} IN \\(([^)]*)\\)`,
    's',
  ).exec(sql);

  return [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe('0025 stage runner', () => {
  it('adds the three tables with their columns and indexes', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    expect(columns(driver, 'ticket_pipelines')).toEqual([
      'ticket_id',
      'lane',
      'pipeline_json',
      'pipeline_hash',
      'config_version',
      'routed_json',
      'created_at',
      'updated_at',
      // Added by 0027 (the Director's per-ticket changes).
      'base_hash',
      'adjusted_json',
    ]);

    expect(columns(driver, 'stage_runs')).toEqual([
      'id',
      'ticket_id',
      'stage_id',
      'member_id',
      'cycle',
      'kind',
      'agent_id',
      'agent_hash',
      'run_id',
      'status',
      'outcome_json',
      'started_at',
      'ended_at',
    ]);

    expect(columns(driver, 'stage_artifacts')).toEqual([
      'id',
      'ticket_id',
      'stage_run_id',
      'kind',
      'content',
      'truncated',
      'sha256',
      'created_at',
    ]);

    const indexes = driver
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
      .map((i) => i.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_stage_runs_ticket',
        'idx_stage_runs_run',
        'idx_stage_artifacts_ticket',
      ]),
    );
  });

  it('writes its own CHECK lists as literals at this version', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id <= 25),
    );

    expect(checkList(driver, 'ticket_pipelines', 'lane')).toEqual([...Lane.options]);
    expect(checkList(driver, 'stage_runs', 'status')).toEqual([...STAGE_RUN_STATUSES]);
    expect(checkList(driver, 'stage_runs', 'kind')).toEqual([
      'agent',
      'script_gate',
      'human',
    ]);

    expect(checkList(driver, 'stage_artifacts', 'kind')).toEqual([
      'plan',
      'ticket',
      'diff',
      'finish_claims',
      'narrative',
      'test_report',
      'findings',
      'gate_report',
    ]);
  });

  it('refuses a second attempt for the same ticket, stage, member and cycle', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(ticket('SF-1'));
    const insert = (member: string, cycle: number): void => {
      driver.run(
        `INSERT INTO stage_runs (ticket_id, stage_id, member_id, cycle, kind, status, started_at)
         VALUES ('SF-1', 'reviewer', '${member}', ${cycle}, 'agent', 'running', '${STAMP}')`,
      );
    };

    insert('', 0);

    expect(() => insert('', 0)).toThrow(/UNIQUE/);
    expect(() => insert('', 1)).not.toThrow();
    expect(() => insert('m', 0)).not.toThrow();
  });

  it('keeps existing tickets and wakes, and stores the new stage wake kind', async () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id < 25),
    );

    driver.run(ticket('SF-1'));
    driver.run(
      `INSERT INTO wake_requests (id, ticket_id, reason, kind, idempotency_key, created_at)
       VALUES ('w-old', 'SF-1', 'crash', 'retry', 'k1', '${STAMP}')`,
    );

    runMigrations(driver);
    driver.run(
      `INSERT INTO wake_requests (id, ticket_id, reason, kind, idempotency_key, created_at)
       VALUES ('w-new', 'SF-1', 'stage:implementer', 'stage', 'k2', '${STAMP}')`,
    );

    const storage = createStorageOnDriver(driver);
    const wakes = await storage.transaction((tx) =>
      tx.wakeRequests.listDue('9999-12-31T00:00:00.000Z'),
    );

    const t = await storage.transaction((tx) => tx.tickets.get('SF-1' as never));

    expect(wakes.map((w) => [w.id, w.kind])).toEqual([
      ['w-old', 'retry'],
      ['w-new', 'stage'],
    ]);

    expect(t?.status).toBe('in_progress');
  });
});

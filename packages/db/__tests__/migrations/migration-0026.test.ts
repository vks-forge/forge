/**
 * Pins that migration 0026 widens the stage tables for the Full lane without losing history.
 *
 * Why: the Full lane records the Director's own check as a stage row of kind `director` with a
 *   `check_report` artifact, which needs both tables' CHECK lists widened by rebuilding them. The
 *   real database already holds stage runs and artifacts from earlier tickets, and foreign keys
 *   are on: a rebuild that loses a row, renumbers an id (artifacts point at their stage run by
 *   id), drops the unique attempt key or an index, or leaves a dangling reference would corrupt
 *   the history of tickets in flight. The CHECK lists must also stay equal to core's so the
 *   database accepts exactly what the code can write.
 *
 * Pins: every seeded 0025 row survives byte for byte with its ids and artifact links, the
 *   foreign key check is clean and enforcement stays on, indexes and the unique key return, the
 *   new kinds are storable while an unknown kind is refused, the next id continues after the
 *   highest one (never reused), and the CHECK lists equal core's.
 * Depends on: src/index, @forge/core, vitest. IO: in-memory SQLite.
 */

import { ArtifactKind, STAGE_RUN_KINDS, STAGE_RUN_STATUSES } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';
import type { SqlDriver } from '#/index.js';

const STAMP = '2026-10-13T00:00:00.000Z';

const ticket = (id: string): string =>
  `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status,
     status_version, created_at, updated_at)
   VALUES ('${id}', 'sf', 't', 'b', 'feat', 'express', 'A', 'in_progress', 0, '${STAMP}', '${STAMP}')`;

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

const before25 = (driver: SqlDriver): void => {
  runMigrations(
    driver,
    MIGRATIONS.filter((m) => m.id <= 25),
  );
};

const addRun = (
  driver: SqlDriver,
  stage: string,
  kind: string,
  status: string,
  outcome: string,
  runId: string | null,
): void => {
  driver.run(
    `INSERT INTO stage_runs (ticket_id, stage_id, member_id, cycle, kind, agent_id, agent_hash,
       run_id, status, outcome_json, started_at, ended_at)
     VALUES ('SF-1', ?, '', 0, ?, 'a-1', 'h-1', ?, ?, ?, ?, ?)`,
    [stage, kind, runId, status, outcome, STAMP, status === 'running' ? null : STAMP],
  );
};

const addArtifact = (
  driver: SqlDriver,
  runId: number,
  kind: string,
  body: string,
): void => {
  driver.run(
    `INSERT INTO stage_artifacts (ticket_id, stage_run_id, kind, content, truncated, sha256, created_at)
     VALUES ('SF-1', ?, ?, ?, 1, 'abc', ?)`,
    [runId, kind, body, STAMP],
  );
};

const maxId = (driver: SqlDriver, table: string): number | undefined =>
  driver.get<{ id: number }>(`SELECT MAX(id) AS id FROM ${table}`)?.id;

const dump = (driver: SqlDriver) => ({
  runs: driver.all('SELECT * FROM stage_runs ORDER BY id'),
  artifacts: driver.all('SELECT * FROM stage_artifacts ORDER BY id'),
  pipelines: driver.all('SELECT * FROM ticket_pipelines ORDER BY ticket_id'),
});

describe('0026 full lane', () => {
  it('keeps every stage run, artifact and pipeline row exactly, ids and links included', () => {
    const driver = openSqliteDriver(':memory:');
    before25(driver);
    driver.run(ticket('SF-1'));
    driver.run(
      `INSERT INTO ticket_pipelines (ticket_id, lane, pipeline_json, pipeline_hash, config_version,
         routed_json, created_at, updated_at)
       VALUES ('SF-1', 'standard', '{"stages":[1,2]}', 'ph', 'v1', '["x"]', '${STAMP}', '${STAMP}')`,
    );

    addRun(driver, 's1', 'agent', 'passed', '{"note":"café \\"q\\"","n":[1,2]}', 'run-1');
    addRun(driver, 's2', 'script_gate', 'failed', '{"gate":{"ok":false}}', 'run-2');
    addRun(driver, 's3', 'human', 'waiting', '{}', null);
    addRun(driver, 's4', 'agent', 'running', '{}', 'run-4');
    driver.run('DELETE FROM stage_runs WHERE stage_id = ?', ['s3']);
    addArtifact(driver, 1, 'plan', 'line1\nline2');
    addArtifact(driver, 2, 'gate_report', '{"r":1}');
    addArtifact(driver, 4, 'diff', '');
    const before = dump(driver);

    // Only 0026: later migrations add columns to ticket_pipelines, which this test compares whole.
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id <= 26),
    );

    const after = dump(driver);
    const links = driver
      .all<{ table: string }>('PRAGMA foreign_key_list(stage_artifacts)')
      .map((f) => f.table);

    expect(before.runs.map((r) => r.id)).toEqual([1, 2, 4]);
    expect(after).toEqual(before);
    expect(driver.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(
      driver.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys,
    ).toBe(1);

    expect(links).toContain('stage_runs');
  });

  it('restores the indexes and the unique attempt key', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(ticket('SF-1'));
    addRun(driver, 's1', 'agent', 'running', '{}', 'r');

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

    expect(() => addRun(driver, 's1', 'agent', 'running', '{}', 'r2')).toThrow(/UNIQUE/);
  });

  it('stores the new kinds, refuses unknown ones and continues ids after the highest', () => {
    const driver = openSqliteDriver(':memory:');
    before25(driver);
    driver.run(ticket('SF-1'));
    addRun(driver, 's1', 'agent', 'passed', '{}', 'r1');
    addRun(driver, 's2', 'agent', 'passed', '{}', 'r2');
    addArtifact(driver, 1, 'plan', 'p');
    addArtifact(driver, 2, 'plan', 'q');

    runMigrations(driver);

    // AUTOINCREMENT must continue after the highest id, never hand out an old one again.
    addRun(driver, 'check', 'director', 'passed', '{}', null);
    const runId = maxId(driver, 'stage_runs') as number;
    addArtifact(driver, runId, 'check_report', '{}');

    expect(runId).toBe(3);
    expect(maxId(driver, 'stage_artifacts')).toBe(3);
    expect(() => addRun(driver, 'x', 'bogus', 'passed', '{}', null)).toThrow(/CHECK/);
    expect(() => addArtifact(driver, 1, 'bogus', '')).toThrow(/CHECK/);
  });

  it("has CHECK lists equal to core's", () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    expect(checkList(driver, 'stage_runs', 'kind')).toEqual([...STAGE_RUN_KINDS]);
    expect(checkList(driver, 'stage_runs', 'status')).toEqual([...STAGE_RUN_STATUSES]);
    expect(checkList(driver, 'stage_artifacts', 'kind')).toEqual([
      ...ArtifactKind.options,
    ]);
  });
});

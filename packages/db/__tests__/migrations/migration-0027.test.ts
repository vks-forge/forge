/**
 * Pins that migration 0027 adds the Director's pipeline changes, proposals, finding marks and run fallback
 * records without touching what tickets in flight already hold.
 *
 * Why: the real database already holds ticket pipeline copies, stage rows, runs and artifacts from tickets in
 *   flight, and foreign keys are on. The migration must keep every row (a copy keeps its own hash as its base
 *   and starts with an empty adjustment log, which is the truth: nothing adjusted it), keep ids and links,
 *   leave runs readable with no model or slot recorded, and create the proposal and mark tables with their
 *   unique key, indexes and foreign keys. The CHECK lists must equal core's so the database accepts exactly
 *   what the code can write, and a decided proposal key must never be insertable twice.
 *
 * Pins: every seeded 0026 row survives byte for byte (ticket pipelines gain `base_hash` = their hash and an
 *   empty log), foreign keys stay clean and enforced, the new columns are nullable or defaulted, the unique
 *   proposal key and the marks' primary key hold, the CHECK lists equal core's, and indexes exist.
 * Depends on: src/index, @forge/core, vitest. IO: in-memory SQLite.
 */

import { PROPOSAL_STATUSES, FindingVerdict, LANES } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';
import type { SqlDriver } from '#/index.js';

const STAMP = '2026-10-18T00:00:00.000Z';

const ticket = (id: string): string =>
  `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status,
     status_version, created_at, updated_at)
   VALUES ('${id}', 'sf', 't', 'b', 'feat', 'standard', 'A', 'in_progress', 0, '${STAMP}', '${STAMP}')`;

const before27 = (driver: SqlDriver): void => {
  runMigrations(
    driver,
    MIGRATIONS.filter((m) => m.id <= 26),
  );
};

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

const proposal = (
  driver: SqlDriver,
  key: string,
  status = 'pending',
  base = 'a'.repeat(64),
): void => {
  driver.run(
    `INSERT INTO pipeline_proposals (project, lane, key, base_hash, op_json, proposed_json, evidence_json,
       count, status, created_at)
     VALUES ('sf', 'standard', ?, ?, '{}', '{}', '[]', 3, ?, ?)`,
    [key, base, status, STAMP],
  );
};

describe('0027 director pipelines', () => {
  it('keeps every ticket pipeline, stage run, artifact and run, backfilling base_hash from the hash', () => {
    const driver = openSqliteDriver(':memory:');
    before27(driver);
    driver.run(ticket('SF-1'));
    driver.run(ticket('SF-2'));
    for (const [id, hash] of [
      ['SF-1', 'h1'],
      ['SF-2', 'h2'],
    ] as const) {
      driver.run(
        `INSERT INTO ticket_pipelines (ticket_id, lane, pipeline_json, pipeline_hash, config_version,
           routed_json, created_at, updated_at)
         VALUES (?, 'standard', '{"definition":{"stages":[1,2]},"roles":{}}', ?, 'c1:p0', '["x"]', ?, ?)`,
        [id, hash, STAMP, STAMP],
      );
    }

    driver.run(
      `INSERT INTO stage_runs (ticket_id, stage_id, member_id, cycle, kind, status, outcome_json, started_at)
       VALUES ('SF-1', 'implementer', '', 0, 'agent', 'passed', '{"note":"cafe"}', ?)`,
      [STAMP],
    );

    driver.run(
      `INSERT INTO stage_artifacts (ticket_id, stage_run_id, kind, content, truncated, sha256, created_at)
       VALUES ('SF-1', 1, 'diff', 'x', 0, 'abc', ?)`,
      [STAMP],
    );

    driver.run(
      `INSERT INTO runs (id, ticket_id, harness, driver_version, cwd, lane, started_at, status, owner, generation)
       VALUES ('r1', 'SF-1', 'claude-code', '1', '/w', 'standard', ?, 'succeeded', 'o', 1)`,
      [STAMP],
    );

    const before = {
      runs: driver.all('SELECT * FROM stage_runs ORDER BY id'),
      artifacts: driver.all('SELECT * FROM stage_artifacts ORDER BY id'),
      tickets: driver.all('SELECT * FROM tickets ORDER BY id'),
      pipelines: driver.all('SELECT * FROM ticket_pipelines ORDER BY ticket_id'),
      theRun: driver.get('SELECT * FROM runs WHERE id = ?', ['r1']),
    };

    runMigrations(driver);

    expect(driver.all('SELECT * FROM stage_runs ORDER BY id')).toEqual(before.runs);
    expect(driver.all('SELECT * FROM stage_artifacts ORDER BY id')).toEqual(
      before.artifacts,
    );

    expect(driver.all('SELECT * FROM tickets ORDER BY id')).toEqual(before.tickets);

    const pipelines = driver.all('SELECT * FROM ticket_pipelines ORDER BY ticket_id');
    for (const [i, row] of pipelines.entries()) {
      const old = before.pipelines[i] as Record<string, unknown>;

      expect(row).toMatchObject({
        ...old,
        base_hash: old['pipeline_hash'],
        adjusted_json: '[]',
      });
    }

    expect(driver.get('SELECT * FROM runs WHERE id = ?', ['r1'])).toMatchObject({
      ...(before.theRun as Record<string, unknown>),
      model: null,
      fallback_slot: null,
    });

    expect(driver.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(
      driver.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys,
    ).toBe(1);
  });

  it('refuses a second proposal for the same project, lane, key and base, in any status', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    proposal(driver, 'standard:add:x@after:g1', 'rejected');

    expect(() => proposal(driver, 'standard:add:x@after:g1')).toThrow(/UNIQUE/);
    expect(() =>
      proposal(driver, 'standard:add:x@after:g1', 'pending', 'b'.repeat(64)),
    ).not.toThrow();

    expect(() => proposal(driver, 'standard:add:y@after:g1', 'bogus')).toThrow(/CHECK/);
  });

  it('keys finding marks by stage row and index and points them at real rows', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(ticket('SF-1'));
    driver.run(
      `INSERT INTO stage_runs (ticket_id, stage_id, member_id, cycle, kind, status, outcome_json, started_at)
       VALUES ('SF-1', 'reviewer', '', 0, 'agent', 'failed', '{}', ?)`,
      [STAMP],
    );

    const mark = (index: number, verdict: string, run = 1): void => {
      driver.run(
        `INSERT INTO finding_marks (stage_run_id, finding_index, ticket_id, verdict, marked_at)
         VALUES (?, ?, 'SF-1', ?, ?)`,
        [run, index, verdict, STAMP],
      );
    };

    mark(0, 'real');

    expect(() => mark(0, 'false_alarm')).toThrow(/UNIQUE|PRIMARY/);
    expect(() => mark(1, 'maybe')).toThrow(/CHECK/);
    expect(() => mark(1, 'real', 99)).toThrow(/FOREIGN/);
  });

  it('creates the indexes', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const indexes = driver
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
      .map((i) => i.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_pipeline_proposals_key',
        'idx_pipeline_proposals_project',
        'idx_finding_marks_ticket',
      ]),
    );
  });

  it("has CHECK lists equal to core's", () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    expect(checkList(driver, 'pipeline_proposals', 'status')).toEqual([
      ...PROPOSAL_STATUSES,
    ]);

    expect(checkList(driver, 'pipeline_proposals', 'lane')).toEqual([...LANES]);
    expect(checkList(driver, 'finding_marks', 'verdict')).toEqual([
      ...FindingVerdict.options,
    ]);
  });
});

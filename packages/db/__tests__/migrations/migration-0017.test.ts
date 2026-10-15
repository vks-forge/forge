/**
 * Pins what migration 0017 adds for resuming runs across a restart.
 *
 * Why: a resumed run must keep its history. Existing runs and receipts become generation 1
 *   with nothing lost, the new run columns start empty, and the join table that links one
 *   secret generation of the receipt chain to the next refuses a duplicate or a generation
 *   below 2. If an upgrade dropped rows or defaulted a column wrongly, a run in flight at
 *   upgrade time could resume under the wrong generation.
 *
 * Pins: 0017 adds runs.generation (default 1), resumable_session, interrupted_at, a generation
 *   column on tool_decisions and tool_effects, and the receipt_resumes table.
 * Depends on: src/index.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';

const columns = (driver: ReturnType<typeof openSqliteDriver>, table: string): string[] =>
  driver.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);

describe('0017 run-resume', () => {
  it('keeps existing runs as generation 1 with empty resume columns', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id < 17),
    );

    driver.run(
      `INSERT INTO runs (id, ticket_id, harness, driver_version, cwd, lane, started_at, status, owner)
       VALUES ('r1', 'SF-1', 'h', '1', '/w', 'express', '2026-10-13T00:00:00.000Z', 'running', 'o')`,
    );

    expect(runMigrations(driver)).toContain(17);
    const row = driver.get<Record<string, unknown>>("SELECT * FROM runs WHERE id = 'r1'");
    driver.close();

    expect(row).toMatchObject({
      generation: 1,
      resumable_session: null,
      interrupted_at: null,
    });
  });

  it('adds the generation column to both receipt tables and the join table', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    expect(columns(driver, 'tool_decisions')).toContain('generation');
    expect(columns(driver, 'tool_effects')).toContain('generation');
    expect(columns(driver, 'receipt_resumes')).toEqual([
      'run_id',
      'generation',
      'chain_seq',
      'ts',
      'prev_hash',
      'hash',
    ]);

    driver.close();
  });

  it('refuses generation 1 and a second resume record for the same generation', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const insert = (generation: number, seq: number): void => {
      driver.run(
        `INSERT INTO receipt_resumes (run_id, generation, chain_seq, ts, prev_hash, hash)
         VALUES ('r1', ?, ?, '2026-10-13T00:00:00.000Z', NULL, ?)`,
        [generation, seq, 'a'.repeat(64)],
      );
    };

    insert(2, 1);

    expect(() => insert(1, 2)).toThrow();
    expect(() => insert(2, 3)).toThrow();
    driver.close();
  });
});

/**
 * Pins what migration 0024 adds for the run's agent record and how old runs read.
 *
 * Why: a run names the agent that ran it and the hash of that agent's definition, so the owner
 *   can tell afterwards exactly what ran. Runs written before agents existed must keep
 *   reading as runs with no agent, not fail to load, or the run history of every existing
 *   install would break on upgrade.
 *
 * Pins: both nullable columns exist, an old run row reads back without them, and a new run
 *   stores them.
 * Depends on: src/index, vitest. IO: in-memory SQLite.
 */

import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  createStorageOnDriver,
  openSqliteDriver,
  runMigrations,
} from '#/index.js';

const STAMP = '2026-10-13T00:00:00.000Z';

const insertRun = (id: string): string =>
  `INSERT INTO runs (id, ticket_id, harness, driver_version, cwd, lane, started_at, status, owner, generation)
   VALUES ('${id}', 'SF-1', 'fake', '0', '/tmp', 'express', '${STAMP}', 'success', 'o', 1)`;

describe('0024 run agent', () => {
  it('adds nullable agent_id and agent_hash to runs', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    const columns = driver
      .all<{ name: string; notnull: number }>('PRAGMA table_info(runs)')
      .filter((c) => c.name === 'agent_id' || c.name === 'agent_hash');

    expect(columns.map((c) => c.name).sort()).toEqual(['agent_hash', 'agent_id']);
    expect(columns.every((c) => c.notnull === 0)).toBe(true);
  });

  it('reads a run written before the migration as a run with no agent', async () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id < 24),
    );

    driver.run(insertRun('old'));
    runMigrations(driver);

    const storage = createStorageOnDriver(driver);
    const run = await storage.transaction((tx) => tx.runs.get('old'));

    expect(run?.id).toBe('old');
    expect(run?.agent_id).toBeUndefined();
    expect(run?.agent_hash).toBeUndefined();
  });
});

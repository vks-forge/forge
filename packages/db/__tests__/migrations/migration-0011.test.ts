/**
 * Migration 0011: many projects per install and GitHub connections.
 *
 * Why: databases created before B4 hold one project and runs with no project column. The
 *   upgrade must keep that project working (status ready, no clone path yet), must
 *   fill each run's project from its ticket so settle and the UI find the right project
 *   runtime, must leave a run whose ticket is gone with no project instead of inventing
 *   one, and must create the connections table without any column for key material.
 *
 * Pins: new project columns and defaults, run.project backfill, github_connections columns,
 *   the status check constraint.
 * Depends on: src/index, vitest. IO: in-memory SQLite.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';

describe('runMigrations', () => {
  describe('0011 many projects', () => {
    it('adds project columns defaulting existing rows to ready, run.project backfilled from the ticket, and github_connections', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver, MIGRATIONS.slice(0, 10));
      driver.run("INSERT INTO projects (id, slug, prefix) VALUES ('sf', 'sf', 'SF')");

      driver.run(
        `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status,
           status_version, created_at, updated_at)
         VALUES ('SF-1', 'sf', 't', 'b', 'feat', 'express', 'A', 'inbox', 0,
           '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z')`,
      );

      driver.run(
        `INSERT INTO runs (id, ticket_id, harness, driver_version, cwd, lane, started_at, status, owner)
         VALUES ('r1', 'SF-1', 'h', '1', '/w', 'express', '2026-10-13T00:00:00.000Z', 'running', 'o'),
                ('orphan', 'SF-404', 'h', '1', '/w', 'express', '2026-10-13T00:00:00.000Z', 'running', 'o')`,
      );

      expect(runMigrations(driver)).toEqual(MIGRATIONS.slice(10).map((m) => m.id));
      const project = driver.get<Record<string, unknown>>('SELECT * FROM projects');
      const runs = driver.all<{ id: string; project: string | null }>(
        'SELECT id, project FROM runs ORDER BY rowid',
      );

      const cols = driver
        .all<{ name: string }>('PRAGMA table_info(github_connections)')
        .map((c) => c.name);

      driver.close();
      expect(project).toMatchObject({
        status: 'ready',
        ecosystems_json: '[]',
        local_path: null,
        connection_id: null,
        repo_full_name: null,
      });

      expect(runs).toEqual([
        { id: 'r1', project: 'sf' },
        { id: 'orphan', project: null },
      ]);

      expect(cols).toEqual([
        'id',
        'account',
        'app_id',
        'app_slug',
        'key_secret_name',
        'status',
        'created_at',
      ]);
    });

    it('refuses a status outside the three states', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      expect(() =>
        driver.run(
          "INSERT INTO projects (id, slug, prefix, status) VALUES ('x', 'x', 'X', 'deleted')",
        ),
      ).toThrow();

      driver.close();
    });
  });
});

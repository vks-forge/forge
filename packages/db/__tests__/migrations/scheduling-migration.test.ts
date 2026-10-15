/**
 * Pins what migration 0016 adds: ticket priority and the parked-harness table.
 *
 * Why: the Director orders waiting tickets by `priority` and skips harnesses listed in
 *   `harness_state`. If upgrading a database lost existing tickets' rank (they must all read
 *   0, never NULL) or the table lacked a column the engine writes, scheduling would crash
 *   or silently ignore a quota pause on exactly the installs that already hold work.
 *
 * Pins: upgrade from 0013 keeps tickets and gives them priority 0; harness_state columns;
 *   no seed rows.
 * Depends on: src/index, vitest.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';

describe('0016 scheduling', () => {
  it('gives existing tickets priority 0 and creates an empty harness_state', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id <= 13),
    );

    driver.run("INSERT INTO projects (id, slug, prefix) VALUES ('SF', 'sf', 'SF')");

    driver.run(
      `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status, status_version, created_at, updated_at)
       VALUES ('SF-1', 'SF', 't', 'b', 'feat', 'express', 'A', 'planned', 0, '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z')`,
    );

    expect(runMigrations(driver)).toContain(16);
    const ticket = driver.get<{ priority: number }>(
      "SELECT priority FROM tickets WHERE id = 'SF-1'",
    );

    const cols = driver
      .all<{ name: string }>('PRAGMA table_info(harness_state)')
      .map((c) => c.name);

    const rows = driver.all('SELECT * FROM harness_state');
    driver.close();
    expect(ticket?.priority).toBe(0);
    expect(cols).toEqual(['harness_id', 'paused_until', 'reason', 'updated_at']);
    expect(rows).toEqual([]);
  });
});

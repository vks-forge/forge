/**
 * Pins what migration 0022 adds for Director planning and how it widens the reply queue.
 *
 * Why: a card started under 0021 must keep working after the upgrade. Its queued replies keep
 *   their ids (the engine references them), its planning columns start empty so nothing is
 *   auto-planned, and the queue now accepts the reasons planning needs; if the rebuilt queue
 *   dropped a row, changed an id or kept the old CHECK, an owner's answer would be lost or
 *   refused. The reason list is copied into the SQL (a shipped migration must never change
 *   with a later edit of the core constant), so a test pins it equal to core's list.
 *
 * Pins: new card columns and their defaults, the `card_plans` shape and primary key, old reply
 *   rows kept with the same ids and the AUTOINCREMENT sequence, the widened reason CHECK,
 *   both indexes, the SQL reason list equal to `CARD_REPLY_REASONS`, and that storage reads
 *   an upgraded card.
 * Depends on: src/index, @forge/core, vitest. IO: in-memory SQLite.
 */

import { CARD_REPLY_REASONS } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  createStorageOnDriver,
  openSqliteDriver,
  runMigrations,
} from '#/index.js';
import type { SqlDriver } from '#/index.js';

const STAMP = '2026-10-13T00:00:00.000Z';

const insertCard = (id: string): string =>
  `INSERT INTO cards (id, project, type, title, summary, source_kind, source_ref,
     created_by_type, created_by_id, created_at, updated_at)
   VALUES ('${id}', 'sf', 'issue', 'T', 'S', 'chat', 'm-${id}', 'user', 'u1', '${STAMP}', '${STAMP}')`;

const insertReply = (
  cardId: string,
  event: number,
  reason: string,
  done = false,
): string =>
  `INSERT INTO card_reply_queue (card_id, event_id, reason, enqueued_at, claimed_at, done_at)
   VALUES ('${cardId}', ${event}, '${reason}', '${STAMP}', ${done ? `'${STAMP}'` : 'NULL'}, ${done ? `'${STAMP}'` : 'NULL'})`;

/** A database at schema 21 with one card and three queued replies (one finished). */
function oldDatabase(): SqlDriver {
  const driver = openSqliteDriver(':memory:');
  runMigrations(
    driver,
    MIGRATIONS.filter((m) => m.id < 22),
  );

  driver.run(insertCard('SF-C1'));
  driver.run(insertReply('SF-C1', 0, 'card_created', true));
  driver.run(insertReply('SF-C1', 1, 'user_message'));
  driver.run(insertReply('SF-C1', 2, 'user_message'));

  return driver;
}

const columns = (driver: SqlDriver, table: string): string[] =>
  driver.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);

describe('0022 card planning', () => {
  it('adds the planning columns, the plan table and keeps the reply queue columns', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    expect(columns(driver, 'cards')).toEqual(
      expect.arrayContaining([
        'flow_json',
        'flow_config_version',
        'flow_cursor',
        'grill_state_json',
      ]),
    );

    expect(columns(driver, 'card_plans')).toEqual([
      'card_id',
      'version',
      'plan_json',
      'created_at',
      'author',
    ]);

    expect(columns(driver, 'card_reply_queue')).toEqual([
      'id',
      'card_id',
      'event_id',
      'reason',
      'enqueued_at',
      'claimed_at',
      'done_at',
    ]);

    const indexes = driver
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
      .map((i) => i.name);

    driver.close();

    expect(indexes).toEqual(
      expect.arrayContaining(['idx_card_reply_queue_open', 'idx_card_reply_queue_card']),
    );
  });

  it('starts an existing card with empty planning data', () => {
    const driver = oldDatabase();
    runMigrations(driver);

    const row = driver.get<Record<string, unknown>>(
      'SELECT flow_json, flow_config_version, flow_cursor, grill_state_json FROM cards',
    );

    driver.close();

    expect(row).toEqual({
      flow_json: null,
      flow_config_version: null,
      flow_cursor: null,
      grill_state_json: '{}',
    });
  });

  it('keeps every queued reply with its id and state', () => {
    const driver = oldDatabase();
    const before = driver.all('SELECT * FROM card_reply_queue ORDER BY id');

    runMigrations(driver);

    const after = driver.all('SELECT * FROM card_reply_queue ORDER BY id');

    driver.close();

    expect(before).toHaveLength(3);
    expect(after).toEqual(before);
  });

  it('continues the id sequence after the rebuild instead of reusing an id', () => {
    const driver = oldDatabase();
    driver.run('DELETE FROM card_reply_queue WHERE id = 3');
    runMigrations(driver);

    driver.run(insertReply('SF-C1', 3, 'grill_answer'));

    const ids = driver
      .all<{ id: number }>('SELECT id FROM card_reply_queue ORDER BY id')
      .map((r) => r.id);

    driver.close();

    expect(ids).toEqual([1, 2, 4]);
  });

  it('accepts the planning reasons and still refuses an unknown one', () => {
    const driver = oldDatabase();
    runMigrations(driver);

    for (const reason of ['grill_answer', 'start_planning', 'plan_changes']) {
      driver.run(insertReply('SF-C1', 9, reason));
    }

    expect(() => driver.run(insertReply('SF-C1', 9, 'nonsense'))).toThrow();
    driver.close();
  });

  it('lists in its CHECK exactly the reasons core defines', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(insertCard('SF-C1'));

    for (const reason of CARD_REPLY_REASONS) {
      driver.run(insertReply('SF-C1', 1, reason));
    }

    const sql = driver.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE name = 'card_reply_queue'",
    )?.sql;

    driver.close();

    const listed = [...(sql ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect([...listed].sort()).toEqual([...CARD_REPLY_REASONS].sort());
  });

  it('refuses a second plan row for the same card and version, and a plan for no card', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(insertCard('SF-C1'));

    const plan = (card: string, version: number, author = 'director'): string =>
      `INSERT INTO card_plans (card_id, version, plan_json, created_at, author)
       VALUES ('${card}', ${version}, '{}', '${STAMP}', '${author}')`;

    driver.run(plan('SF-C1', 1));

    expect(() => driver.run(plan('SF-C1', 1))).toThrow();
    expect(() => driver.run(plan('SF-C9', 1))).toThrow();
    expect(() => driver.run(plan('SF-C1', 2, 'robot'))).toThrow();
    driver.run(plan('SF-C1', 2, 'owner'));
    driver.close();
  });

  it('lets storage read an upgraded card and answer its planning state with defaults', async () => {
    const driver = oldDatabase();
    runMigrations(driver);
    const storage = createStorageOnDriver(driver);

    const state = await storage.transaction((tx) =>
      tx.cardPlanning.get('SF-C1' as never),
    );

    await storage.close();

    expect(state.flow).toBeNull();
    expect(state.grill.answers).toEqual([]);
  });
});

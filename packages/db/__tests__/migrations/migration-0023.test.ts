/**
 * Pins what migration 0023 adds for ticket escalations and how it treats existing questions.
 *
 * Why: before escalations every pending question was already the owner's, with no Director
 *   stage in between. After the upgrade the Inbox shows only questions with `escalated_at`, so
 *   an old question left without it would silently vanish from the owner's view while its
 *   ticket still waits. The migration therefore stamps every existing row as already with the
 *   owner (`escalated_at = asked_at`), and gives every row the card of its ticket so the card
 *   page can list a ticket's waits. It adds only the column and an index: classifying the old
 *   parked tickets is left to the engine's start-up sweep, which reads the reason text in code
 *   (the same text rules for both storage adapters).
 *
 * Pins: the new column, the index on (card_id, status), old rows stamped with their asked_at,
 *   old rows given their ticket's card id (and left empty for a ticket with no card), rows added
 *   after the migration starting without a stamp, and that storage reads an upgraded row.
 * Depends on: src/index, vitest. IO: in-memory SQLite.
 */

import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  createStorageOnDriver,
  openSqliteDriver,
  runMigrations,
} from '#/index.js';
import type { SqlDriver } from '#/index.js';

const STAMP = '2026-10-13T00:00:00.000Z';
const ASKED = '2026-10-13T08:30:00.000Z';

const ticket = (id: string, cardId: string | null): string =>
  `INSERT INTO tickets (id, project, card_id, title, body, type, lane, tier_predicted, status,
     status_version, created_at, updated_at)
   VALUES ('${id}', 'sf', ${cardId === null ? 'NULL' : `'${cardId}'`}, 't', 'b', 'feat', 'express',
     'A', 'waiting_human', 0, '${STAMP}', '${STAMP}')`;

const interaction = (
  id: string,
  ticketId: string,
  cardId: string | null = null,
): string =>
  `INSERT INTO interactions (id, ticket_id, card_id, kind, payload_json, status, asked_at, timeout_at)
   VALUES ('${id}', '${ticketId}', ${cardId === null ? 'NULL' : `'${cardId}'`}, 'question',
     '{"prompt":"which db?"}', 'pending', '${ASKED}', '2026-10-14T00:00:00.000Z')`;

/** A database at schema 22 with questions on a card ticket, a card-less ticket and a ticket whose row already names the card. */
function oldDatabase(): SqlDriver {
  const driver = openSqliteDriver(':memory:');
  runMigrations(
    driver,
    MIGRATIONS.filter((m) => m.id < 23),
  );

  driver.run(ticket('SF-1', 'SF-C1'));
  driver.run(ticket('SF-2', null));
  driver.run(ticket('SF-3', 'SF-C3'));
  driver.run(interaction('i1', 'SF-1'));
  driver.run(interaction('i2', 'SF-2'));
  driver.run(interaction('i3', 'SF-3', 'SF-C3'));

  return driver;
}

describe('0023 escalations', () => {
  it('adds escalated_at and the (card_id, status) index', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    const columns = driver
      .all<{ name: string }>('PRAGMA table_info(interactions)')
      .map((c) => c.name);

    const indexes = driver
      .all<{ name: string }>('PRAGMA index_list(interactions)')
      .map((i) => i.name);

    expect(columns).toContain('escalated_at');
    expect(indexes).toContain('idx_interactions_card_status');
  });

  it('stamps existing questions as already with the owner', () => {
    const driver = oldDatabase();
    expect(runMigrations(driver)).toEqual([23, 24, 25]);

    const rows = driver.all<{ id: string; escalated_at: string | null }>(
      'SELECT id, escalated_at FROM interactions ORDER BY id',
    );

    expect(rows).toEqual([
      { id: 'i1', escalated_at: ASKED },
      { id: 'i2', escalated_at: ASKED },
      { id: 'i3', escalated_at: ASKED },
    ]);
  });

  it('gives each question the card of its ticket and leaves a card-less ticket empty', () => {
    const driver = oldDatabase();
    runMigrations(driver);

    const rows = driver.all<{ id: string; card_id: string | null }>(
      'SELECT id, card_id FROM interactions ORDER BY id',
    );

    expect(rows).toEqual([
      { id: 'i1', card_id: 'SF-C1' },
      { id: 'i2', card_id: null },
      { id: 'i3', card_id: 'SF-C3' },
    ]);
  });

  it('leaves rows inserted after the migration without a stamp, so they start with the Director', () => {
    const driver = oldDatabase();
    runMigrations(driver);
    driver.run(interaction('i4', 'SF-1'));

    expect(
      driver.get<{ escalated_at: string | null }>(
        "SELECT escalated_at FROM interactions WHERE id = 'i4'",
      )?.escalated_at,
    ).toBeNull();
  });

  it('lets storage read an upgraded row', async () => {
    const driver = oldDatabase();
    runMigrations(driver);
    const storage = createStorageOnDriver(driver);

    expect(await storage.transaction((tx) => tx.interactions.get('i1'))).toMatchObject({
      escalated_at: ASKED,
      card_id: 'SF-C1',
    });
  });
});

/**
 * Pins what migration 0019 adds for cards and how it backfills existing tickets.
 *
 * Why: a ticket always belongs to a card (d-0105), but databases made before cards hold
 *   tickets with none. The upgrade must give each one a card the Board and the Card page can
 *   open: an id that follows the ticket's number, the ticket's title and body, the real
 *   intake source when there was one, and a history that starts with the request and the
 *   ticket's creation, without inventing moves it never recorded. It must also seed the four
 *   built-in card types, which the in-memory store mirrors from core.
 *
 * Pins: 0019 tables and `tickets.card_id`; backfill of id, link, type, title, summary,
 *   source (intake and legacy), creator, timestamps and the two events; an empty body falls
 *   back to the title; seeded registry equals core's built-in types; a fresh database has no
 *   cards.
 * Depends on: src/index, @forge/core, vitest. IO: in-memory SQLite.
 */

import { BUILTIN_CARD_TYPES } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';
import { createStorageOnDriver } from '#/index.js';

const ticket = (id: string, over: { intake?: number; body?: string } = {}): string =>
  `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status,
     status_version, created_by_intake, created_at, updated_at)
   VALUES ('${id}', 'sf', 'Title ${id}', '${over.body ?? 'Body ' + id}', 'feat', 'express', 'A',
     'planned', 0, ${over.intake ?? 'NULL'}, '2026-10-13T00:00:00.000Z', '2026-10-13T01:00:00.000Z')`;

describe('0019 cards', () => {
  it('gives every existing ticket a card with a two-event history', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id < 19),
    );

    driver.run(
      `INSERT INTO intake_events (source, kind, dedupe_key, actor_json, project, payload_json, received_at)
       VALUES ('github_issue', 'new_request', 'issue-7', '{"type":"external","id":"hook-1"}', 'sf', '{}', '2026-10-13T00:00:00.000Z')`,
    );

    driver.run(ticket('SF-12', { intake: 1 }));
    driver.run(ticket('SF-13'));
    driver.run(ticket('SF-14', { body: '' }));

    expect(runMigrations(driver)).toEqual([19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);

    const cards = driver.all<Record<string, unknown>>('SELECT * FROM cards ORDER BY id');
    const links = driver.all<{ id: string; card_id: string }>(
      'SELECT id, card_id FROM tickets ORDER BY rowid',
    );

    const events = driver.all<Record<string, unknown>>(
      'SELECT * FROM card_events ORDER BY card_id, seq',
    );

    driver.close();

    expect(links).toEqual([
      { id: 'SF-12', card_id: 'SF-C12' },
      { id: 'SF-13', card_id: 'SF-C13' },
      { id: 'SF-14', card_id: 'SF-C14' },
    ]);

    expect(cards.map((c) => c['id'])).toEqual(['SF-C12', 'SF-C13', 'SF-C14']);
    expect(cards[0]).toMatchObject({
      project: 'sf',
      type: 'issue',
      title: 'Title SF-12',
      summary: 'Body SF-12',
      source_kind: 'github_issue',
      source_ref: 'issue-7',
      created_by_type: 'external',
      created_by_id: 'hook-1',
      created_at: '2026-10-13T00:00:00.000Z',
      updated_at: '2026-10-13T01:00:00.000Z',
      closed_reason: null,
      budget_cap_usd: null,
    });

    expect(cards[1]).toMatchObject({
      source_kind: 'legacy',
      source_ref: 'SF-13',
      created_by_type: 'system',
      created_by_id: 'migration-0019',
    });

    expect(events.map((e) => [e['card_id'], e['seq'], e['kind']])).toEqual([
      ['SF-C12', 0, 'user_message'],
      ['SF-C12', 1, 'ticket_created'],
      ['SF-C13', 0, 'user_message'],
      ['SF-C13', 1, 'ticket_created'],
      ['SF-C14', 0, 'user_message'],
      ['SF-C14', 1, 'ticket_created'],
    ]);

    expect(JSON.parse(String(events[0]?.['payload_json']))).toEqual({
      text: 'Body SF-12',
    });

    expect(JSON.parse(String(events[1]?.['payload_json']))).toEqual({
      ticket_id: 'SF-12',
      title: 'Title SF-12',
    });

    expect(JSON.parse(String(events[4]?.['payload_json']))).toEqual({
      text: 'Title SF-14',
    });
  });

  it('lets the storage read the backfilled cards, and numbers the next card after them', async () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id < 19),
    );

    driver.run(ticket('SF-12'));
    runMigrations(driver);
    const storage = createStorageOnDriver(driver);

    const card = await storage.transaction((tx) => tx.cards.get('SF-C12' as never));
    const events = await storage.transaction((tx) =>
      tx.cardEvents.list('SF-C12' as never, { limit: 10 }),
    );

    const next = await storage.transaction((tx) => tx.cards.nextNumber('SF'));
    await storage.close();

    expect(card?.title).toBe('Title SF-12');
    expect(events.map((e) => e.kind)).toEqual(['user_message', 'ticket_created']);
    expect(next).toBe(13);
  });

  it('seeds the registry with exactly the built-in types, in order', async () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const storage = createStorageOnDriver(driver);

    const types = await storage.transaction((tx) => tx.cardTypes.list());
    const cards = await storage.transaction((tx) =>
      tx.cards.listByProject('sf', { limit: 10 }),
    );

    await storage.close();

    expect(types).toEqual([...BUILTIN_CARD_TYPES]);
    expect(cards).toEqual([]);
  });
});

/**
 * Pins what migration 0021 adds for the card-first flow and how it backfills existing cards.
 *
 * Why: the upgrade must not strand or auto-start old work (d-0141 item 7). A card with a
 *   live ticket keeps running as `in_progress` (or `done` when all its tickets are merged),
 *   a closed card stays closed, and an open card with no live ticket becomes `plan_ready`
 *   with a Needs you flag and a "Start planning" note so the owner has an action, while
 *   nothing is queued for the Director so old cards are never graded or grilled behind the
 *   owner's back. A Discussion is never planned. The card type registry must follow the
 *   decisions too: Issue no longer files a ticket at intake, and plan approval becomes the
 *   Director-or-owner choice.
 *
 * Pins: new columns and tables, the phase of each kind of existing card, the note event, an
 *   empty reply queue, the converted card type rows (including a custom type), the CHECK on
 *   phase, and that the storage reads the backfilled rows.
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

const card = (id: string, over: { type?: string; closed?: string } = {}): string =>
  `INSERT INTO cards (id, project, type, title, summary, source_kind, source_ref,
     created_by_type, created_by_id, created_at, updated_at, closed_reason)
   VALUES ('${id}', 'sf', '${over.type ?? 'issue'}', 'T ${id}', 'S ${id}', 'chat', 'm-${id}',
     'user', 'u1', '${STAMP}', '${STAMP}', ${over.closed ? `'${over.closed}'` : 'NULL'})`;

const ticket = (id: string, cardId: string, status: string): string =>
  `INSERT INTO tickets (id, project, card_id, title, body, type, lane, tier_predicted, status,
     status_version, created_at, updated_at)
   VALUES ('${id}', 'sf', '${cardId}', 't', 'b', 'feat', 'express', 'A', '${status}', 0,
     '${STAMP}', '${STAMP}')`;

/** A database at schema 20 holding one card of every backfill kind. */
function oldDatabase(): SqlDriver {
  const driver = openSqliteDriver(':memory:');
  runMigrations(
    driver,
    MIGRATIONS.filter((m) => m.id < 21),
  );

  driver.run(card('SF-C1'));
  driver.run(ticket('SF-1', 'SF-C1', 'waiting_human'));
  driver.run(card('SF-C2'));
  driver.run(ticket('SF-2', 'SF-C2', 'done'));
  driver.run(ticket('SF-3', 'SF-C2', 'cancelled'));
  driver.run(card('SF-C3'));
  driver.run(card('SF-C4', { closed: 'duplicate' }));
  driver.run(ticket('SF-4', 'SF-C4', 'in_progress'));
  driver.run(card('SF-C5', { type: 'discussion' }));
  driver.run(card('SF-C6'));
  driver.run(ticket('SF-5', 'SF-C6', 'cancelled'));
  driver.run(card('SF-C7'));
  driver.run(ticket('SF-6', 'SF-C7', 'done'));
  driver.run(ticket('SF-7', 'SF-C7', 'review'));

  return driver;
}

describe('0021 card flow', () => {
  it('adds the phase columns, relations, reply queue and interaction card id', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    const columns = (table: string): string[] =>
      driver.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);

    expect(columns('cards')).toEqual(
      expect.arrayContaining([
        'phase',
        'phase_version',
        'needs_you',
        'priority',
        'links_json',
      ]),
    );

    expect(columns('card_relations')).toEqual([
      'from_card',
      'to_card',
      'kind',
      'created_at',
    ]);

    expect(columns('card_reply_queue')).toEqual([
      'id',
      'card_id',
      'event_id',
      'reason',
      'enqueued_at',
      'claimed_at',
      'done_at',
    ]);

    expect(columns('interactions')).toContain('card_id');
    expect(columns('card_types')).toContain('plan_approval');
    driver.close();
  });

  it('backfills each existing card from today facts', () => {
    const driver = oldDatabase();
    runMigrations(driver);

    const rows = driver.all<{ id: string; phase: string; needs_you: number }>(
      'SELECT id, phase, needs_you FROM cards ORDER BY id',
    );

    driver.close();

    expect(rows).toEqual([
      { id: 'SF-C1', phase: 'in_progress', needs_you: 0 },
      { id: 'SF-C2', phase: 'done', needs_you: 0 },
      { id: 'SF-C3', phase: 'plan_ready', needs_you: 1 },
      { id: 'SF-C4', phase: 'closed', needs_you: 0 },
      { id: 'SF-C5', phase: 'grilling', needs_you: 0 },
      { id: 'SF-C6', phase: 'plan_ready', needs_you: 1 },
      { id: 'SF-C7', phase: 'in_progress', needs_you: 0 },
    ]);
  });

  it('gives the open cards without a live ticket a Start planning note, and no one else', () => {
    const driver = oldDatabase();
    runMigrations(driver);

    const notes = driver.all<{ card_id: string; seq: number; payload_json: string }>(
      "SELECT card_id, seq, payload_json FROM card_events WHERE actor_id = 'migration-0021' ORDER BY card_id",
    );

    driver.close();

    expect(notes.map((n) => n.card_id)).toEqual(['SF-C3', 'SF-C6']);
    expect(notes.map((n) => n.seq)).toEqual([0, 0]);
    expect(JSON.parse(notes[0]?.payload_json ?? '{}')).toEqual({
      text: expect.stringContaining('Start planning'),
    });
  });

  it('queues nothing, so old cards are never auto-grilled', () => {
    const driver = oldDatabase();
    runMigrations(driver);

    const queued = driver.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM card_reply_queue',
    );

    driver.close();

    expect(queued?.n).toBe(0);
  });

  it('starts every card at version 0, normal priority and no links', () => {
    const driver = oldDatabase();
    runMigrations(driver);

    const rows = driver.all<{
      phase_version: number;
      priority: string;
      links_json: string;
    }>('SELECT phase_version, priority, links_json FROM cards');

    driver.close();

    expect(rows.every((r) => r.phase_version === 0 && r.priority === 'normal')).toBe(
      true,
    );

    expect(rows.every((r) => r.links_json === '[]')).toBe(true);
  });

  it('converts the card types: Issue plans first, approval is director_or_user or user', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id < 21),
    );

    driver.run(`INSERT INTO card_types (name, label, icon, allowed_sources_json, actions_json,
      plan_approval, tickets_on_intake) VALUES ('epic', 'Epic', 'layers', '["chat"]', '["chat"]', 1, 0)`);

    runMigrations(driver);

    const types = driver.all<{
      name: string;
      plan_approval: string;
      tickets_on_intake: number;
    }>('SELECT name, plan_approval, tickets_on_intake FROM card_types ORDER BY rowid');

    driver.close();

    expect(types).toEqual([
      { name: 'discussion', plan_approval: 'user', tickets_on_intake: 0 },
      { name: 'plan', plan_approval: 'director_or_user', tickets_on_intake: 0 },
      { name: 'issue', plan_approval: 'director_or_user', tickets_on_intake: 0 },
      { name: 'pr_issue', plan_approval: 'user', tickets_on_intake: 1 },
      { name: 'epic', plan_approval: 'director_or_user', tickets_on_intake: 0 },
    ]);
  });

  it('refuses a phase outside the lifecycle and a self relation', () => {
    const driver = oldDatabase();
    runMigrations(driver);

    expect(() =>
      driver.run("UPDATE cards SET phase = 'limbo' WHERE id = 'SF-C1'"),
    ).toThrow();

    expect(() =>
      driver.run(
        `INSERT INTO card_relations (from_card, to_card, kind, created_at)
         VALUES ('SF-C1', 'SF-C1', 'depends_on', '${STAMP}')`,
      ),
    ).toThrow();

    driver.close();
  });

  it('lets the storage read the backfilled cards and the migrated registry', async () => {
    const driver = oldDatabase();
    runMigrations(driver);
    const storage = createStorageOnDriver(driver);

    const c1 = await storage.transaction((tx) => tx.cards.get('SF-C3' as never));
    const issue = await storage.transaction((tx) => tx.cardTypes.get('issue'));
    await storage.close();

    expect(c1).toMatchObject({
      phase: 'plan_ready',
      phase_version: 0,
      needs_you: true,
      priority: 'normal',
      links: [],
    });

    expect(issue).toMatchObject({
      plan_approval: 'director_or_user',
      tickets_on_intake: false,
    });
  });
});

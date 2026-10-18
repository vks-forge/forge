/**
 * Pins that migration 0028 adds research sources and card evidence without touching what already exists.
 *
 * Why: the real database already holds tickets, cards, plans, runs and stage rows, and foreign keys are on.
 *   The migration is additive: it must keep every row byte for byte, leave foreign keys clean and enforced,
 *   and create the two tables with the keys that make research safe to rerun: one source ref per card
 *   (a step that reruns after a restart cannot produce a second `S1`), one evidence ref per card, and no
 *   source or evidence pointing at a card or ticket that does not exist. The CHECK lists must equal core's
 *   so the database accepts exactly what the code can write.
 *
 * Pins: seeded 0027 rows survive unchanged (and a new source or evidence row can point at them), foreign
 *   keys stay clean and enforced, the unique (card, ref) source index and the evidence unique key hold, a
 *   Worker source needs no card ref, the CHECK lists equal core's, and the indexes exist.
 * Depends on: src/index, @forge/core, vitest. IO: in-memory SQLite.
 */

import { EVIDENCE_ORIGINS, EVIDENCE_STATUSES, SOURCE_ORIGINS } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';
import type { SqlDriver } from '#/index.js';

const STAMP = '2026-10-18T00:00:00.000Z';

const ticket = (id: string): string =>
  `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status,
     status_version, created_at, updated_at)
   VALUES ('${id}', 'sf', 't', 'b', 'feat', 'standard', 'A', 'in_progress', 0, '${STAMP}', '${STAMP}')`;

const card = (id: string): string =>
  `INSERT INTO cards (id, project, type, title, summary, source_kind, source_ref, created_by_type,
     created_by_id, created_at, updated_at)
   VALUES ('${id}', 'sf', 'issue', 'c', 's', 'chat', 'm', 'user', 'u1', '${STAMP}', '${STAMP}')`;

const before28 = (driver: SqlDriver): void => {
  runMigrations(
    driver,
    MIGRATIONS.filter((m) => m.id <= 27),
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

const source = (
  driver: SqlDriver,
  over: {
    card?: string | null;
    ref?: string | null;
    origin?: string;
    truncated?: number;
  } = {},
): void => {
  driver.run(
    `INSERT INTO research_sources (project, card_id, ref, origin, url, final_url, title, retrieved_at,
       sha256, bytes, truncated, text)
     VALUES ('sf', ?, ?, ?, 'https://a.io/', 'https://a.io/', 'A', ?, 'h', 3, ?, 'abc')`,
    [
      over.card === undefined ? 'SF-C1' : over.card,
      over.ref === undefined ? 'S1' : over.ref,
      over.origin ?? 'director',
      STAMP,
      over.truncated ?? 0,
    ],
  );
};

const evidence = (
  driver: SqlDriver,
  ref = 'E1',
  over: { origin?: string; status?: string; card?: string } = {},
): void => {
  driver.run(
    `INSERT INTO card_evidence (card_id, ref, step_id, origin, claim, quotes_json, sources_json, status, created_at)
     VALUES (?, ?, 'research', ?, 'claim', '[]', '["S1"]', ?, ?)`,
    [
      over.card ?? 'SF-C1',
      ref,
      over.origin ?? 'research_step',
      over.status ?? 'verified',
      STAMP,
    ],
  );
};

describe('0028 research', () => {
  it('keeps every seeded 0027 row unchanged and lets new rows point at them', () => {
    const driver = openSqliteDriver(':memory:');
    before28(driver);
    driver.run(ticket('SF-1'));
    driver.run(card('SF-C1'));
    driver.run(
      `INSERT INTO runs (id, ticket_id, harness, driver_version, cwd, lane, started_at, status, owner, generation)
       VALUES ('r1', 'SF-1', 'claude-code', '1', '/w', 'standard', ?, 'succeeded', 'o', 1)`,
      [STAMP],
    );

    driver.run(
      `INSERT INTO ticket_pipelines (ticket_id, lane, pipeline_json, pipeline_hash, config_version,
         routed_json, created_at, updated_at, base_hash, adjusted_json)
       VALUES ('SF-1', 'standard', '{"definition":{"stages":[1]},"roles":{}}', 'h1', 'c1:p0', '[]', ?, ?, 'h1', '[]')`,
      [STAMP, STAMP],
    );

    const tables = ['tickets', 'cards', 'runs', 'ticket_pipelines', 'config_versions'];
    const snapshot = () =>
      Object.fromEntries(tables.map((t) => [t, driver.all(`SELECT * FROM ${t}`)]));

    const seeded = snapshot();
    expect(seeded['tickets']).toHaveLength(1);
    expect(seeded['cards']).toHaveLength(1);

    runMigrations(driver);

    expect(snapshot()).toEqual(seeded);
    expect(driver.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(
      driver.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys,
    ).toBe(1);

    expect(() => source(driver)).not.toThrow();
    expect(() => evidence(driver)).not.toThrow();
    expect(
      driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM research_sources')?.n,
    ).toBe(1);
  });

  it('refuses a second source with the same ref on a card but allows it on another card', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(card('SF-C1'));
    driver.run(card('SF-C2'));
    source(driver);

    expect(() => source(driver)).toThrow(/UNIQUE/);
    expect(() => source(driver, { card: 'SF-C2' })).not.toThrow();
  });

  it('lets Worker sources have no card and no ref, any number of times', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    expect(() => {
      source(driver, { card: null, ref: null, origin: 'worker' });
      source(driver, { card: null, ref: null, origin: 'worker' });
    }).not.toThrow();
  });

  it('points sources and evidence at real cards and refuses bad values', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(card('SF-C1'));

    expect(() => source(driver, { card: 'SF-C99' })).toThrow(/FOREIGN/);
    expect(() => source(driver, { origin: 'robot' })).toThrow(/CHECK/);
    expect(() => source(driver, { ref: 'S2', truncated: 2 })).toThrow(/CHECK/);
    expect(() => evidence(driver, 'E1', { card: 'SF-C99' })).toThrow(/FOREIGN/);
    expect(() => evidence(driver, 'E1', { origin: 'model' })).toThrow(/CHECK/);
    expect(() => evidence(driver, 'E1', { status: 'maybe' })).toThrow(/CHECK/);
  });

  it('refuses a second evidence ref on a card', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(card('SF-C1'));
    evidence(driver);

    expect(() => evidence(driver)).toThrow(/UNIQUE/);
    expect(() => evidence(driver, 'E2')).not.toThrow();
  });

  it('creates the indexes', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const indexes = driver
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
      .map((i) => i.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_research_sources_card_ref',
        'idx_research_sources_run',
        'idx_research_sources_project',
      ]),
    );
  });

  it("has CHECK lists equal to core's", () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    expect(checkList(driver, 'research_sources', 'origin')).toEqual([...SOURCE_ORIGINS]);
    expect(checkList(driver, 'card_evidence', 'origin')).toEqual([...EVIDENCE_ORIGINS]);
    expect(checkList(driver, 'card_evidence', 'status')).toEqual([...EVIDENCE_STATUSES]);
  });
});

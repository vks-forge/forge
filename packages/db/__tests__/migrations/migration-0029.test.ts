/**
 * Pins that migration 0029 adds project memory without touching what exists, and that its constraints hold.
 *
 * Why: the real database already holds tickets, cards, plans, runs, evidence and stage rows, and foreign
 *   keys are on. The migration is additive: every old row must survive byte for byte and foreign keys stay
 *   clean, and the memory tables must start empty. The CHECK lists must equal core's so the database accepts
 *   exactly what the code can write, and tags and links must point at a real record. The append-only
 *   triggers are pinned in the sibling migration-0029-triggers test.
 *
 * Pins: seeded 0028 rows survive and memory tables start empty, foreign keys clean and enforced, CHECK
 *   lists equal core's, bad values and duplicate ids refused, tags and links need a real record, the
 *   full-text tables exist and keep projects apart.
 * Depends on: src/index, helpers/memory-sql, @forge/core, vitest. IO: in-memory SQLite.
 */

import {
  MEMORY_EVENT_KINDS,
  MEMORY_IMPORT_STATES,
  MEMORY_LINK_RELS,
  MemoryAuthor,
  MemoryKind,
  MemoryOrigin,
  MemoryStatus,
} from '@forge/core';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';
import {
  STAMP,
  card,
  checkList,
  fresh,
  memoryTables,
  record,
  ticket,
} from '#tests/helpers/memory-sql.js';

describe('0029 memory: additive', () => {
  it('keeps every seeded 0028 row unchanged and starts with empty memory tables', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id <= 28),
    );

    driver.run(ticket('SF-1'));
    driver.run(card('SF-C1'));
    driver.run(
      `INSERT INTO runs (id, ticket_id, harness, driver_version, cwd, lane, started_at, status, owner, generation)
       VALUES ('r1', 'SF-1', 'claude-code', '1', '/w', 'standard', ?, 'succeeded', 'o', 1)`,
      [STAMP],
    );

    driver.run(
      `INSERT INTO research_sources (project, card_id, ref, origin, url, final_url, title, retrieved_at,
         sha256, bytes, truncated, text)
       VALUES ('sf', 'SF-C1', 'S1', 'director', 'https://a.io/', 'https://a.io/', 'A', ?, 'h', 3, 0, 'abc')`,
      [STAMP],
    );

    driver.run(
      `INSERT INTO card_evidence (card_id, ref, step_id, origin, claim, quotes_json, sources_json, status, created_at)
       VALUES ('SF-C1', 'E1', 'research', 'research_step', 'claim', '[]', '["S1"]', 'verified', ?)`,
      [STAMP],
    );

    const tables = [
      'tickets',
      'cards',
      'runs',
      'research_sources',
      'card_evidence',
      'config_versions',
    ];

    const snapshot = () =>
      Object.fromEntries(tables.map((t) => [t, driver.all(`SELECT * FROM ${t}`)]));

    const seeded = snapshot();
    expect(seeded['research_sources']).toHaveLength(1);

    expect(
      runMigrations(
        driver,
        MIGRATIONS.filter((m) => m.id <= 29),
      ),
    ).toEqual([29]);

    expect(snapshot()).toEqual(seeded);
    expect(driver.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(
      driver.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys,
    ).toBe(1);

    for (const t of memoryTables) {
      expect(driver.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)?.n, t).toBe(0);
    }
  });

  it("has CHECK lists equal to core's", () => {
    const driver = fresh();

    expect(checkList(driver, 'memory_records', 'kind')).toEqual([...MemoryKind.options]);
    expect(checkList(driver, 'memory_records', 'status')).toEqual([
      ...MemoryStatus.options,
    ]);

    expect(checkList(driver, 'memory_records', 'author')).toEqual([
      ...MemoryAuthor.options,
    ]);

    expect(checkList(driver, 'memory_records', 'origin')).toEqual([
      ...MemoryOrigin.options,
    ]);

    expect(checkList(driver, 'memory_links', 'rel')).toEqual([...MEMORY_LINK_RELS]);
    expect(checkList(driver, 'memory_events', 'event')).toEqual([...MEMORY_EVENT_KINDS]);
    expect(checkList(driver, 'memory_imports', 'state')).toEqual([
      ...MEMORY_IMPORT_STATES,
    ]);

    expect(checkList(driver, 'memory_links', 'target_kind')).toEqual([
      'record',
      'card',
      'ticket',
    ]);
  });

  it('creates the full-text tables and the indexes', () => {
    const driver = fresh();
    const names = driver
      .all<{ name: string }>('SELECT name FROM sqlite_master')
      .map((r) => r.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'memory_fts',
        'memory_fts_vocab',
        'idx_memory_records_scope',
        'idx_memory_tags_tag',
        'idx_memory_links_target',
      ]),
    );
  });
});

describe('0029 memory: constraints', () => {
  it('refuses bad values and a duplicate id, and scopes ids by project', () => {
    const driver = fresh();
    record(driver);

    expect(() => record(driver)).toThrow(/UNIQUE/);
    expect(() => record(driver, 'd-0002', { project: 'other' })).not.toThrow();
    expect(() => record(driver, 'd-0003', { statement: '   ' })).toThrow(/CHECK/);
    expect(() => record(driver, 'd-0003', { kind: 'note' })).toThrow(/CHECK/);
    expect(() => record(driver, 'd-0003', { author: 'robot' })).toThrow(/CHECK/);
    expect(() => record(driver, 'd-0003', { confidence: 1.5 })).toThrow(/CHECK/);
    expect(() => record(driver, 'd-0003', { pinned: 2 })).toThrow(/CHECK/);
  });

  it('needs a real record for a tag or a link', () => {
    const driver = fresh();

    expect(() =>
      driver.run(
        "INSERT INTO memory_tags (project, id, tag) VALUES ('forge', 'd-0009', 't')",
      ),
    ).toThrow(/FOREIGN/);

    expect(() =>
      driver.run(
        "INSERT INTO memory_links (project, from_id, rel, target_kind, target) VALUES ('forge', 'd-0009', 'cites', 'record', 'd-0001')",
      ),
    ).toThrow(/FOREIGN/);

    record(driver);
    expect(() =>
      driver.run(
        "INSERT INTO memory_tags (project, id, tag) VALUES ('forge', 'd-0001', 't')",
      ),
    ).not.toThrow();
  });
});

describe('0029 memory: full-text index', () => {
  it('matches stemmed words and keeps projects apart by the unindexed column', () => {
    const driver = fresh();
    driver.run(
      "INSERT INTO memory_fts (statement, gist, tags, aliases, body, project, id) VALUES ('Running tests first', '', 'tdd', '', '', 'a', 'd-0001')",
    );

    driver.run(
      "INSERT INTO memory_fts (statement, gist, tags, aliases, body, project, id) VALUES ('Running tests first', '', 'tdd', '', '', 'b', 'd-0001')",
    );

    const hits = driver.all<{ project: string }>(
      `SELECT project FROM memory_fts WHERE memory_fts MATCH '"run"' AND project = 'a'`,
    );

    expect(hits).toEqual([{ project: 'a' }]);
  });
});

/**
 * Pins the migration runner: idempotent, checksummed, forward-only, full table set.
 *
 * Why: the database is opened on every start. If migrations were not idempotent a
 *   restart could fail or double-apply, and if an edited migration were accepted,
 *   installs would silently diverge in schema. Pinning checksum rejection, ordering and
 *   rollback of a failing migration protects every existing database from a bad schema
 *   change (director-core.md §3).
 *
 * Pins: runMigrations() applies once, is idempotent, rejects edited or out-of-order
 *   migrations, and creates every state and verification table; the applied set is read
 *   inside BEGIN IMMEDIATE so a second opener cannot make it stale; a database with
 *   migrations this binary does not know is refused; checkSchemaCurrent() reports
 *   current / behind / ahead / edited without migrating. Two openers on one fresh file
 *   are simulated in-process (a real second process cannot run the TypeScript sources
 *   with plain node here).
 * Depends on: src/index.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ForgeError } from '@forge/core';
import {
  MIGRATIONS,
  checkSchemaCurrent,
  openSqliteDriver,
  runMigrations,
} from '#/index.js';
import type { SqlDriver, SqlRow, SqlValue } from '#/index.js';

const dir = mkdtempSync(join(tmpdir(), 'forge-mig-'));
let n = 0;
const nextPath = () => join(dir, `m${n++}.sqlite`);
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const EXPECTED_TABLES = [
  'projects',
  'tickets',
  'ticket_relations',
  'intake_events',
  'wake_requests',
  'runs',
  'run_events',
  'run_inbox',
  'interactions',
  'gate_results',
  'tool_decisions',
  'tool_effects',
  'skills_registry',
  'skill_usage',
  'run_tokens',
  'schema_migrations',
];

describe('runMigrations', () => {
  it('creates every state and verification table and records each migration once', () => {
    const driver = openSqliteDriver(':memory:');
    const applied = runMigrations(driver);
    const tables = driver
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r.name);
    driver.close();
    expect(applied).toEqual(MIGRATIONS.map((m) => m.id));
    expect(tables).toEqual(expect.arrayContaining(EXPECTED_TABLES));
  });

  it('is idempotent: a second run applies nothing', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const again = runMigrations(driver);
    driver.close();
    expect(again).toEqual([]);
  });

  it('applies only the newer migrations on an existing database', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver, MIGRATIONS.slice(0, 1));
    const applied = runMigrations(driver);
    driver.close();
    expect(applied).toEqual([2, 3, 4, 5, 6]);
  });

  describe('0003 receipt chain columns', () => {
    const columns = (
      driver: ReturnType<typeof openSqliteDriver>,
      table: string,
    ): string[] =>
      driver.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name);

    const expectChainColumns = (driver: ReturnType<typeof openSqliteDriver>): void => {
      expect(columns(driver, 'tool_decisions')).toEqual(
        expect.arrayContaining(['reason', 'parent_call_id']),
      );
      expect(columns(driver, 'tool_effects')).toEqual(
        expect.arrayContaining(['run_id', 'chain_seq']),
      );
      expect(columns(driver, 'runs')).toContain('final_chain_hash');
      const indexes = driver
        .all<{ name: string }>('PRAGMA index_list(tool_effects)')
        .map((r) => r.name);
      expect(indexes).toContain('idx_tool_effects_run_chain');
    };

    it('exists after migrating a fresh database', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      expectChainColumns(driver);
      driver.close();
    });

    it('exists after upgrading a database that already has 0001 and 0002, keeping old rows', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver, MIGRATIONS.slice(0, 2));
      driver.run(
        `INSERT INTO tool_effects (decision_id, state, ts, hash) VALUES ('d1', 'read_completed', '2026-01-01T00:00:00.000Z', 'h')`,
      );
      runMigrations(driver);
      expectChainColumns(driver);
      const row = driver.all<{ run_id: string; chain_seq: number }>(
        "SELECT run_id, chain_seq FROM tool_effects WHERE decision_id = 'd1'",
      );
      driver.close();
      expect(row).toEqual([{ run_id: '', chain_seq: 0 }]);
    });
  });

  describe('0004 run tokens and receipt chain position', () => {
    const columns = (driver: ReturnType<typeof openSqliteDriver>, table: string) =>
      driver.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name);

    it('creates run_tokens with the hash-only columns', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      const cols = columns(driver, 'run_tokens');
      driver.close();
      expect(cols).toEqual(['run_id', 'token_sha256', 'issued_at', 'revoked_at']);
    });

    it('gives decisions a chain position and makes positions unique per run', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      expect(columns(driver, 'tool_decisions')).toContain('chain_seq');
      const insert = (id: string, chain: number) =>
        driver.run(
          `INSERT INTO tool_decisions (id, run_id, seq, tool, args_hash, decision, layer, ts, hash, chain_seq)
           VALUES (?, 'r1', ?, 't', 'a', 'allow', 'rule', 'ts', 'h', ?)`,
          [id, chain, chain],
        );
      insert('d1', 1);
      expect(() =>
        driver.run(
          `INSERT INTO tool_decisions (id, run_id, seq, tool, args_hash, decision, layer, ts, hash, chain_seq)
           VALUES ('d2', 'r1', 2, 't', 'a', 'allow', 'rule', 'ts', 'h', 1)`,
        ),
      ).toThrow();
      driver.close();
    });

    it('upgrades a 0001-0003 database in place, keeping legacy decisions at position 0', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver, MIGRATIONS.slice(0, 3));
      driver.run(
        `INSERT INTO tool_decisions (id, run_id, seq, tool, args_hash, decision, layer, ts, hash)
         VALUES ('old1', 'r1', 1, 't', 'a', 'allow', 'rule', 'ts', 'h'),
                ('old2', 'r1', 2, 't', 'a', 'allow', 'rule', 'ts', 'h')`,
      );
      expect(runMigrations(driver)).toEqual([4, 5, 6]);
      const rows = driver.all<{ chain_seq: number }>(
        'SELECT chain_seq FROM tool_decisions',
      );
      driver.close();
      expect(rows).toEqual([{ chain_seq: 0 }, { chain_seq: 0 }]);
    });
  });

  describe('0006 ticket PR link', () => {
    it('adds nullable pr_number and pr_url to tickets and keeps existing rows', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      const cols = driver
        .all<{ name: string; notnull: number }>('PRAGMA table_info(tickets)')
        .filter((c) => c.name === 'pr_number' || c.name === 'pr_url');
      driver.close();
      expect(cols.map((c) => c.name).sort()).toEqual(['pr_number', 'pr_url']);
      expect(cols.every((c) => c.notnull === 0)).toBe(true);
    });
  });

  describe('0005 ports batch C', () => {
    const columns = (driver: ReturnType<typeof openSqliteDriver>, table: string) =>
      driver.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name);

    it('adds the run lifecycle, wake request and receipt resource columns', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      expect(columns(driver, 'runs')).toEqual(
        expect.arrayContaining([
          'owner',
          'pid',
          'last_event_at',
          'catalogue_hash',
          'prompt_hash',
          'hook_registered_at',
        ]),
      );
      expect(columns(driver, 'wake_requests')).toEqual(
        expect.arrayContaining(['created_at', 'consumed_at']),
      );
      expect(columns(driver, 'tool_decisions')).toContain('resource');
      driver.close();
    });

    it('drops the parent_id and blocked_by_json copies: ticket_relations is the only home', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      const cols = columns(driver, 'tickets');
      driver.close();
      expect(cols).not.toContain('parent_id');
      expect(cols).not.toContain('blocked_by_json');
    });

    it('indexes the stall scan, the wake re-wake count and the gate lookup', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      const names = (table: string) =>
        driver.all<{ name: string }>(`PRAGMA index_list(${table})`).map((r) => r.name);
      const found = [
        ...names('runs'),
        ...names('wake_requests'),
        ...names('interactions'),
      ];
      driver.close();
      expect(found).toEqual(
        expect.arrayContaining([
          'idx_runs_status',
          'idx_wake_requests_ticket_created',
          'idx_interactions_ticket',
        ]),
      );
    });

    it('upgrades a 0001-0004 database: legacy parent and blockers become relation rows, old runs get a legacy owner', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver, MIGRATIONS.slice(0, 4));
      const ticket = (id: string, parent: string | null, blockers: string) =>
        driver.run(
          `INSERT INTO tickets (id, project, parent_id, title, body, type, lane, tier_predicted,
             status, status_version, blocked_by_json, created_at, updated_at)
           VALUES (?, 'SF', ?, 't', 'b', 'feat', 'express', 'A', 'inbox', 0, ?, '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z')`,
          [id, parent, blockers],
        );
      ticket('SF-1', 'SF-9', '["SF-2","SF-3"]');
      ticket('SF-2', null, '[]');
      driver.run(
        `INSERT INTO runs (id, ticket_id, harness, driver_version, cwd, lane, started_at, status)
         VALUES ('old', 'SF-1', 'h', '1', '/w', 'express', '2026-10-13T00:00:00.000Z', 'running')`,
      );
      expect(runMigrations(driver)).toEqual([5, 6]);
      const edges = driver.all<{ from_id: string; to_id: string; kind: string }>(
        'SELECT from_id, to_id, kind FROM ticket_relations ORDER BY rowid',
      );
      const run = driver.get<{ owner: string }>(
        "SELECT owner FROM runs WHERE id = 'old'",
      );
      driver.close();
      expect(edges).toEqual([
        { from_id: 'SF-1', to_id: 'SF-9', kind: 'spawned_from' },
        { from_id: 'SF-1', to_id: 'SF-2', kind: 'depends_on' },
        { from_id: 'SF-1', to_id: 'SF-3', kind: 'depends_on' },
      ]);
      expect(run?.owner).toBe('pre-0005');
    });
  });

  it('rejects a migration edited after it was applied', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const first = MIGRATIONS[0];
    if (!first) throw new Error('no migrations');
    const edited = [{ ...first, sql: `${first.sql} -- edited` }, ...MIGRATIONS.slice(1)];
    expect(() => runMigrations(driver, edited)).toThrow(/edited after apply/);
    driver.close();
  });

  it('rejects non-increasing ids and rolls a failing migration back', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver, []);
    expect(() =>
      runMigrations(driver, [
        { id: 2, name: 'a', sql: 'SELECT 1' },
        { id: 1, name: 'b', sql: 'SELECT 1' },
      ]),
    ).toThrow(/must increase/);
    expect(() =>
      runMigrations(driver, [{ id: 3, name: 'bad', sql: 'CREATE TABLE x (' }]),
    ).toThrow();
    const rows = driver.all('SELECT id FROM schema_migrations WHERE id = 3');
    driver.close();
    expect(rows).toEqual([]);
  });
});

describe('concurrent and mismatched openers', () => {
  it('reads the applied set only after taking the write lock', () => {
    const real = openSqliteDriver(':memory:');
    const log: string[] = [];
    const spy: SqlDriver = {
      ...real,
      exec: (sql) => {
        log.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
        real.exec(sql);
      },
      all: <T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]) => {
        log.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));
        return real.all<T>(sql, params);
      },
    };
    runMigrations(spy);
    real.close();
    const begin = log.indexOf('BEGIN IMMEDIATE');
    const readSelect = log.findIndex((l) => l.startsWith('SELECT id, checksum'));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(readSelect).toBeGreaterThan(begin);
  });

  it('survives another opener migrating between our read and our write', () => {
    const path = nextPath();
    const a = openSqliteDriver(path, { busyTimeoutMs: 0 });
    const b = openSqliteDriver(path);
    let hooked = false;
    let aBlocked = false;
    const racing: SqlDriver = {
      ...b,
      all: <T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]) => {
        const rows = b.all<T>(sql, params);
        if (!hooked && sql.includes('FROM schema_migrations')) {
          hooked = true;
          // Opener A tries to migrate right after B's read. With B holding the write
          // lock it is turned away; without the lock it would win and B's stale read
          // would make it re-create existing tables.
          try {
            runMigrations(a);
          } catch {
            aBlocked = true;
          }
        }
        return rows;
      },
    };
    const appliedByB = runMigrations(racing);
    const appliedByA = runMigrations(a);
    a.close();
    b.close();
    expect(hooked).toBe(true);
    expect(aBlocked).toBe(true);
    expect(appliedByB).toEqual(MIGRATIONS.map((m) => m.id));
    expect(appliedByA).toEqual([]);
  });

  it('lets two sequential openers on a fresh file both succeed, applying once', () => {
    const path = nextPath();
    const a = openSqliteDriver(path);
    const b = openSqliteDriver(path);
    const first = runMigrations(a);
    const second = runMigrations(b);
    const count = b.get<{ c: number }>('SELECT COUNT(*) AS c FROM schema_migrations');
    a.close();
    b.close();
    expect(first).toEqual(MIGRATIONS.map((m) => m.id));
    expect(second).toEqual([]);
    expect(count?.c).toBe(MIGRATIONS.length);
  });

  it('refuses a database that has migrations this binary does not know', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(
      "INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (99, 'future', 'x', 't')",
    );
    let failure: unknown;
    try {
      runMigrations(driver);
    } catch (e) {
      failure = e;
    }
    driver.close();
    expect(failure).toBeInstanceOf(ForgeError);
    expect(String((failure as Error).message)).toMatch(/newer|unknown migration/i);
    expect(String((failure as Error).message)).toContain('99');
  });

  it('applies nothing when the unknown-migration check fails', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver, MIGRATIONS.slice(0, 2));
    driver.run(
      "INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (99, 'future', 'x', 't')",
    );
    expect(() => runMigrations(driver)).toThrow();
    const ids = driver
      .all<{ id: number }>('SELECT id FROM schema_migrations ORDER BY id')
      .map((r) => r.id);
    driver.close();
    expect(ids).toEqual([1, 2, 99]);
  });

  it('rolls back every pending migration when one of them fails (one transaction)', () => {
    const driver = openSqliteDriver(':memory:');
    expect(() =>
      runMigrations(driver, [
        { id: 1, name: 'ok', sql: 'CREATE TABLE t1 (x)' },
        { id: 2, name: 'bad', sql: 'CREATE TABLE (' },
      ]),
    ).toThrow();
    const tables = driver.all(
      "SELECT name FROM sqlite_master WHERE name IN ('t1', 'schema_migrations')",
    );
    driver.close();
    expect(tables).toEqual([]);
  });
});

describe('checkSchemaCurrent', () => {
  it('reports behind on a fresh database and creates nothing', () => {
    const driver = openSqliteDriver(':memory:');
    const report = checkSchemaCurrent(driver);
    const tables = driver.all("SELECT name FROM sqlite_master WHERE type = 'table'");
    driver.close();
    expect(report).toMatchObject({
      status: 'behind',
      pending: MIGRATIONS.map((m) => m.id),
      unknown: [],
    });
    expect(tables).toEqual([]);
  });

  it('reports behind when only some migrations are applied, then current', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver, MIGRATIONS.slice(0, 2));
    const behind = checkSchemaCurrent(driver);
    runMigrations(driver);
    const current = checkSchemaCurrent(driver);
    driver.close();
    expect(behind).toMatchObject({ status: 'behind', pending: [3, 4, 5, 6] });
    expect(current).toMatchObject({ status: 'current', pending: [], unknown: [] });
  });

  it('reports ahead when the database has newer migrations than the binary', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(
      "INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (99, 'future', 'x', 't')",
    );
    const report = checkSchemaCurrent(driver);
    driver.close();
    expect(report).toMatchObject({ status: 'ahead', unknown: [99] });
  });

  it('reports edited when an applied migration no longer matches its checksum', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const first = MIGRATIONS[0];
    if (!first) throw new Error('no migrations');
    const report = checkSchemaCurrent(driver, [
      { ...first, sql: `${first.sql} -- x` },
      ...MIGRATIONS.slice(1),
    ]);
    driver.close();
    expect(report.status).toBe('edited');
    expect(report.edited).toEqual([first.id]);
  });
});

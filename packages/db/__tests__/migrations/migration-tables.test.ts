/**
 * Pins the tables and columns each migration adds.
 *
 * Why: later code reads columns such as the receipt chain position, the run token hash
 *   and the ticket PR link. If a migration dropped or renamed one, a database upgraded in
 *   place would break at the first query while a fresh install still worked. Each
 *   migration's shape is pinned so upgrades and fresh installs stay identical
 *   (director-core.md �3).
 *
 * Pins: 0003 receipt chain columns, 0004 run tokens and chain position, 0005 ports
 *   batch C tables, 0006 ticket PR link, 0008 gate head sha, 0009 config versions, 0010 run config version.
 * Depends on: src/index.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';

describe('runMigrations', () => {
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

      expect(runMigrations(driver)).toEqual([4, 5, 6, 7, 8, 9, 10]);
      const rows = driver.all<{ chain_seq: number }>(
        'SELECT chain_seq FROM tool_decisions',
      );

      driver.close();
      expect(rows).toEqual([{ chain_seq: 0 }, { chain_seq: 0 }]);
    });
  });

  describe('0009 config versions', () => {
    it('creates config_versions with its columns', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      const cols = driver
        .all<{ name: string }>('PRAGMA table_info(config_versions)')
        .map((c) => c.name);

      driver.close();
      expect(cols).toEqual([
        'id',
        'scope',
        'project',
        'version',
        'doc_json',
        'author',
        'reason',
        'created_at',
      ]);
    });
  });

  describe('0008 gate head sha', () => {
    it('adds a nullable head_sha to gate_results', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      const col = driver
        .all<{ name: string; notnull: number }>('PRAGMA table_info(gate_results)')
        .find((c) => c.name === 'head_sha');

      driver.close();
      expect(col).toBeDefined();
      expect(col?.notnull).toBe(0);
    });
  });

  describe('0007 ticket parked_from', () => {
    it('adds a nullable parked_from to tickets', () => {
      const driver = openSqliteDriver(':memory:');
      runMigrations(driver);
      const col = driver
        .all<{ name: string; notnull: number }>('PRAGMA table_info(tickets)')
        .find((c) => c.name === 'parked_from');

      driver.close();
      expect(col).toBeDefined();
      expect(col?.notnull).toBe(0);
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
          'config_version',
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

      expect(runMigrations(driver)).toEqual([5, 6, 7, 8, 9, 10]);
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
});

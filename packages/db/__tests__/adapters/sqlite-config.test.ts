/**
 * Pins the SQLite ConfigSource: shared contract plus what only a real database shows.
 *
 * Why: the contract proves the behaviour; this file pins that saved settings survive a
 *   restart (the engine reopens the file and must see the same version a run recorded),
 *   that a stale save from a second connection is refused by the unique index even when
 *   the in-process check is bypassed, and that history cannot be rewritten by any SQL
 *   (the triggers), which is what lets a run's recorded config version be trusted later
 *   (d-0085).
 *
 * Pins: contract behaviour of createSqliteConfigSource(), persistence across reopen,
 *   UPDATE and DELETE refused on config_versions, duplicate (scope, project, version)
 *   refused, a company row cannot carry a project and a project row must.
 * Depends on: contract/config-source.contract, src/index, better-sqlite3.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { openSqlite } from '#/index.js';
import { describeConfigSourceContract } from '#tests/contract/config-source.contract.js';

const dir = mkdtempSync(join(tmpdir(), 'forge-db-config-'));
let n = 0;
const nextPath = () => join(dir, `c${n++}.sqlite`);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const handle = (path: string) => () => {
  const { storage, config } = openSqlite(path);

  return { source: config, close: () => storage.close() };
};

describeConfigSourceContract('sqlite (file)', () => handle(nextPath())());
describeConfigSourceContract('sqlite (:memory:)', () => handle(':memory:')());

const doc = (slots: number) => ({ engine: { max_concurrent_global: slots } });

describe('sqlite config source specifics', () => {
  it('returns warnings for an old-format stored document that the conversion cut down', async () => {
    const path = nextPath();
    await openSqlite(path).storage.close();
    const raw = new Database(path);
    raw
      .prepare(
        `INSERT INTO config_versions (scope, project, version, doc_json, author, reason, created_at)
         VALUES ('project', 'old', 1, ?, 'a', 'legacy', ?)`,
      )
      .run(
        JSON.stringify({ profile: 'ts', commands: { test: 'pnpm test', tset: 'x' } }),
        Date.now(),
      );

    raw.close();

    const backend = openSqlite(path);
    const view = await backend.config.project('old');
    await backend.storage.close();

    expect(view.warnings).toEqual(['the command for unknown role "tset" was dropped']);
    expect(view.config.project.checks.map((c) => c.role)).toEqual(['test']);
  });

  it('keeps versions across reopen and continues the numbering', async () => {
    const path = nextPath();
    const first = openSqlite(path);
    await first.config.append({
      scope: 'company',
      doc: doc(4),
      author: 'a',
      reason: 'r',
      expectedVersion: 0,
    });

    await first.storage.close();

    const second = openSqlite(path);
    const view = await second.config.company();
    const next = await second.config.append({
      scope: 'company',
      doc: doc(5),
      author: 'a',
      reason: 'r',
      expectedVersion: 1,
    });

    await second.storage.close();
    expect(view.version).toBe(1);
    expect(view.config.engine.max_concurrent_global).toBe(4);
    expect(next.version).toBe(2);
  });

  describe('the table itself', () => {
    const insert = (
      db: Database.Database,
      scope: string,
      project: string | null,
      v: number,
    ) =>
      db
        .prepare(
          `INSERT INTO config_versions (scope, project, version, doc_json, author, reason, created_at)
           VALUES (?, ?, ?, '{}', 'a', 'r', 1)`,
        )
        .run(scope, project, v);

    const fresh = (): Database.Database => {
      const path = nextPath();
      void openSqlite(path).storage.close();

      return new Database(path);
    };

    it('refuses UPDATE and DELETE of a saved version', () => {
      const db = fresh();
      insert(db, 'company', null, 1);

      expect(() => db.prepare("UPDATE config_versions SET reason = 'x'").run()).toThrow(
        /immutable/,
      );

      expect(() => db.prepare('DELETE FROM config_versions').run()).toThrow(/immutable/);
      db.close();
    });

    it('refuses a second row for the same scope, project and version, company included', () => {
      const db = fresh();
      insert(db, 'company', null, 1);
      insert(db, 'project', 'sf', 1);

      expect(() => insert(db, 'company', null, 1)).toThrow(/UNIQUE/);
      expect(() => insert(db, 'project', 'sf', 1)).toThrow(/UNIQUE/);
      expect(() => insert(db, 'project', 'web', 1)).not.toThrow();
      db.close();
    });

    it('refuses a company row with a project and a project row without one', () => {
      const db = fresh();

      expect(() => insert(db, 'company', 'sf', 1)).toThrow(/CHECK/);
      expect(() => insert(db, 'project', null, 1)).toThrow(/CHECK/);
      db.close();
    });
  });
});

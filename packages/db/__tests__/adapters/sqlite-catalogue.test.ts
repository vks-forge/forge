/**
 * Pins the SQLite CatalogueStore: shared contract plus what only a real database shows.
 *
 * Why: the contract proves the behaviour; this file pins that the built-in catalogue is
 *   written once even when processes open the same file together, that a saved catalogue
 *   survives a restart (the server reopens the file and must see the version a run
 *   recorded), that a stale save through a second connection is refused by the primary key
 *   even when the in-process check is bypassed, and that history cannot be rewritten by any
 *   SQL (the triggers), which is what lets a run's recorded catalogue hash be trusted later
 *   (d-0085).
 *
 * Pins: contract behaviour of createSqliteCatalogueStore(), seed written once, persistence
 *   across reopen, UPDATE and DELETE refused on catalogue_versions, duplicate version
 *   refused.
 * Depends on: contract/catalogue-store.contract, src/index, better-sqlite3.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_CATALOGUE } from '@forge/tools';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { openSqlite } from '#/index.js';
import { describeCatalogueStoreContract } from '#tests/contract/catalogue-store.contract.js';

const dir = mkdtempSync(join(tmpdir(), 'forge-db-catalogue-'));
let n = 0;
const nextPath = () => join(dir, `c${n++}.sqlite`);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const handle = (path: string) => () => {
  const { storage, catalogue } = openSqlite(path);

  return { store: catalogue, close: () => storage.close() };
};

describeCatalogueStoreContract('sqlite (file)', () => handle(nextPath())());
describeCatalogueStoreContract('sqlite (:memory:)', () => handle(':memory:')());

describe('sqlite catalogue store specifics', () => {
  it('writes the seed once when two connections open the same file', async () => {
    const path = nextPath();
    const a = openSqlite(path);
    const b = openSqlite(path);
    const versions = await a.catalogue.history();

    await Promise.all([a.storage.close(), b.storage.close()]);
    expect(versions.map((v) => v.version)).toEqual([1]);
  });

  it('keeps saved versions across reopen and continues the numbering', async () => {
    const path = nextPath();
    const first = openSqlite(path);
    const doc = {
      entries: BUILT_IN_CATALOGUE.entries.filter((e) => e.id !== 'mcp__forge__web_fetch'),
    };

    await first.catalogue.append({ doc, author: 'a', reason: 'r', expectedVersion: 1 });
    await first.storage.close();

    const second = openSqlite(path);
    const current = await second.catalogue.current();
    const next = await second.catalogue.append({
      doc: BUILT_IN_CATALOGUE,
      author: 'a',
      reason: 'revert',
      expectedVersion: 2,
    });

    await second.storage.close();
    expect(current.version).toBe(2);
    expect(current.doc).toEqual(doc);
    expect(next.version).toBe(3);
  });

  describe('the table itself', () => {
    const fresh = (): Database.Database => {
      const path = nextPath();
      void openSqlite(path).storage.close();

      return new Database(path);
    };

    it('refuses UPDATE and DELETE of a saved version', () => {
      const db = fresh();

      expect(() =>
        db.prepare("UPDATE catalogue_versions SET reason = 'x'").run(),
      ).toThrow(/immutable/);

      expect(() => db.prepare('DELETE FROM catalogue_versions').run()).toThrow(
        /immutable/,
      );

      db.close();
    });

    it('refuses a second row for the same version', () => {
      const db = fresh();

      expect(() =>
        db
          .prepare(
            "INSERT INTO catalogue_versions (version, doc_json, author, reason, created_at) VALUES (1, '{}', 'a', 'r', 1)",
          )
          .run(),
      ).toThrow(/UNIQUE|PRIMARY/);

      db.close();
    });
  });
});

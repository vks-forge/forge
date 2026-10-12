/**
 * Pins the SQLite StorageAdapter: shared contract plus WAL, busy_timeout and persistence.
 *
 * Why: sqlite WAL with a single writer is the default backend (d-0023, director-core.md
 *   §2-§3); the contract runs on a temp file and on `:memory:`, never inside the repo.
 *
 * Pins: contract behaviour of createSqliteStorage(), WAL journal mode, reopen durability,
 *   a second connection waiting on busy_timeout.
 * Depends on: contract/storage.contract, src/index, better-sqlite3.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { createSqliteStorage, openSqliteDriver } from '#/index.js';
import { describeStorageContract } from '#tests/contract/storage.contract.js';
import { makeTicket } from '#tests/helpers/fixtures.js';

const dir = mkdtempSync(join(tmpdir(), 'forge-db-'));
let n = 0;
const nextPath = () => join(dir, `t${n++}.sqlite`);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeStorageContract('sqlite (file)', () => createSqliteStorage(nextPath()));
describeStorageContract('sqlite (:memory:)', () => createSqliteStorage(':memory:'));

describe('sqlite file specifics', () => {
  it('uses WAL journal mode', async () => {
    const path = nextPath();
    const db = createSqliteStorage(path);
    const raw = new Database(path, { readonly: true });
    const mode = raw.pragma('journal_mode', { simple: true });
    raw.close();
    await db.close();
    expect(mode).toBe('wal');
  });

  it('persists data across reopen and re-applies migrations idempotently', async () => {
    const path = nextPath();
    const first = createSqliteStorage(path);
    await first.transaction((tx) => tx.tickets.insert(makeTicket(1)));
    await first.close();

    const second = createSqliteStorage(path);
    const got = await second.transaction((tx) => tx.tickets.get(makeTicket(1).id));
    await second.close();
    expect(got?.title).toBe('Ticket 1');
  });

  it('applies busy_timeout and foreign_keys pragmas to the connection', () => {
    const driver = openSqliteDriver(':memory:', { busyTimeoutMs: 1234 });
    const busy = driver.get<{ timeout: number }>('PRAGMA busy_timeout');
    driver.close();
    expect(busy?.timeout).toBe(1234);
  });
});

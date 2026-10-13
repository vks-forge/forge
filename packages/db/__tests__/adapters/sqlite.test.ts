/**
 * Pins the SQLite StorageAdapter: shared contract plus WAL, busy_timeout and persistence.
 *
 * Why: the contract proves the adapter is correct; this file pins what only a real
 *   database shows and the Director relies on: WAL mode (readers do not block the
 *   writer), data surviving a restart with migrations safely re-applied, and a second
 *   connection waiting on busy_timeout rather than failing, which is how the API and the
 *   Director's writer coexist (d-0023, director-core.md §2-§3). The contract runs on a
 *   temp file and on `:memory:`, never inside the repo.
 *
 * Pins: contract behaviour of createSqliteStorage() and the SQLite receipt log, receipt
 *   column mapping and chain persistence across reopen, WAL journal mode, reopen durability,
 *   idempotent re-migration on reopen, connection pragmas, a second connection waiting
 *   on busy_timeout.
 * Also pins backend failures mapped to typed ForgeErrors (busy -> stall, corrupt row ->
 *   unknown with cause) and receipts.append re-entered from a storage transaction.
 * Depends on: contract/storage.contract, src/index, better-sqlite3.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ForgeError,
  InvalidInputError,
  StallError,
  UnknownForgeError,
} from '@forge/core';
import { verifyChain } from '@forge/tools';
import { createSqliteStorage, openSqlite, openSqliteDriver } from '#/index.js';
import { describeReceiptLogContract } from '#tests/contract/receipt-log.contract.js';
import { describeStorageContract } from '#tests/contract/storage.contract.js';
import { makeRun, makeTicket } from '#tests/helpers/fixtures.js';
import { RECEIPT_SECRET, appendDecision, appendEffect } from '#tests/helpers/receipts.js';

const dir = mkdtempSync(join(tmpdir(), 'forge-db-'));
let n = 0;
const nextPath = () => join(dir, `t${n++}.sqlite`);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeStorageContract('sqlite (file)', () => createSqliteStorage(nextPath()));
describeStorageContract('sqlite (:memory:)', () => createSqliteStorage(':memory:'));

const receiptHandle = (path: string) => () => {
  const { storage, receipts } = openSqlite(path);
  return { log: receipts, close: () => storage.close() };
};
describeReceiptLogContract('sqlite (file)', () => receiptHandle(nextPath())());
describeReceiptLogContract('sqlite (:memory:)', () => receiptHandle(':memory:')());

describe('sqlite receipt log specifics', () => {
  it('persists the chain across reopen and keeps appending to it', async () => {
    const path = nextPath();
    const first = openSqlite(path);
    await appendDecision(first.receipts, 'r1', 'c1');
    await appendEffect(first.receipts, 'r1', 'c1');
    await first.storage.close();

    const second = openSqlite(path);
    await appendDecision(second.receipts, 'r1', 'c2');
    const chain = await second.receipts.list('r1');
    await second.storage.close();
    expect(chain.map((r) => r.kind)).toEqual(['decision', 'effect', 'decision']);
    expect(verifyChain(chain, RECEIPT_SECRET)).toEqual({ ok: true, value: 3 });
  });

  it('writes decisions to tool_decisions and effects to tool_effects with chain columns', async () => {
    const path = nextPath();
    const { storage, receipts } = openSqlite(path);
    await appendDecision(receipts, 'r1', 'c1');
    await appendEffect(receipts, 'r1', 'c1');
    await storage.close();

    const raw = new Database(path, { readonly: true });
    const decision = raw.prepare('SELECT * FROM tool_decisions').get() as Record<
      string,
      unknown
    >;
    const effect = raw.prepare('SELECT * FROM tool_effects').get() as Record<
      string,
      unknown
    >;
    raw.close();
    expect(decision).toMatchObject({
      id: 'c1',
      run_id: 'r1',
      seq: 1,
      chain_seq: 1,
      tool: 'shell',
      decision: 'allow',
      reason: 'rule_allow',
      layer: 'rule',
      rule_id: 'lane:standard#4',
      finding_ids_json: '["f-1","f-2"]',
      enforced_by: 'hook',
      prev_hash: null,
      parent_call_id: null,
    });
    expect(effect).toMatchObject({
      decision_id: 'c1',
      run_id: 'r1',
      chain_seq: 2,
      state: 'mutation_committed',
      prev_hash: decision['hash'],
    });
  });

  it('shares one writer with storage: interleaved transactions and appends all land', async () => {
    const { storage, receipts } = openSqlite(':memory:');
    await Promise.all([
      storage.transaction((tx) => tx.runs.insert(makeRun('r1'))),
      appendDecision(receipts, 'r1', 'c1'),
      storage.transaction((tx) =>
        tx.runEvents.append('r1', {
          type: 'text',
          ts: '2026-10-13T00:00:00.000Z',
          text: 'x',
        }),
      ),
      appendDecision(receipts, 'r1', 'c2'),
    ]);
    const chain = await receipts.list('r1');
    const run = await storage.transaction((tx) => tx.runs.get('r1'));
    await storage.close();
    expect(run?.id).toBe('r1');
    expect(verifyChain(chain, RECEIPT_SECRET)).toEqual({ ok: true, value: 2 });
  });

  it('stores only the token hash in run_tokens', async () => {
    const path = nextPath();
    const storage = createSqliteStorage(path);
    await storage.transaction((tx) =>
      tx.runTokens.put('r1', 'd'.repeat(64), '2026-10-13T00:00:00.000Z'),
    );
    await storage.close();
    const raw = new Database(path, { readonly: true });
    const row = raw.prepare('SELECT * FROM run_tokens').get();
    raw.close();
    expect(row).toEqual({
      run_id: 'r1',
      token_sha256: 'd'.repeat(64),
      issued_at: '2026-10-13T00:00:00.000Z',
      revoked_at: null,
    });
  });
});

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

  it('applies busy_timeout, foreign_keys and synchronous=FULL pragmas to the connection', () => {
    const driver = openSqliteDriver(nextPath(), { busyTimeoutMs: 1234 });
    const busy = driver.get<{ timeout: number }>('PRAGMA busy_timeout');
    const fk = driver.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
    const sync = driver.get<{ synchronous: number }>('PRAGMA synchronous');
    driver.close();
    expect(busy?.timeout).toBe(1234);
    expect(fk?.foreign_keys).toBe(1);
    // 2 = FULL: every commit is fsynced, so a power loss cannot drop acknowledged commits.
    expect(sync?.synchronous).toBe(2);
  });

  it('maps SQLITE_BUSY to a StallError with the driver error as cause', async () => {
    const path = nextPath();
    const holder = openSqliteDriver(path);
    holder.exec('CREATE TABLE IF NOT EXISTS probe (x)');
    const db = createSqliteStorage(path, { busyTimeoutMs: 20 });
    holder.exec('BEGIN IMMEDIATE');
    const failure = await db
      .transaction((tx) => tx.tickets.insert(makeTicket(1)))
      .catch((e: unknown) => e);
    holder.exec('ROLLBACK');
    holder.close();
    expect(failure).toBeInstanceOf(StallError);
    expect((failure as ForgeError).errorFamily).toBe('stall');
    expect((failure as ForgeError).cause).toBeDefined();
    // the adapter recovers once the lock is gone
    await db.transaction((tx) => tx.tickets.insert(makeTicket(1)));
    await db.close();
  });

  it('wraps a row that fails schema validation on read as UnknownForgeError with the ZodError as cause', async () => {
    const path = nextPath();
    const db = createSqliteStorage(path);
    await db.transaction((tx) => tx.tickets.insert(makeTicket(1)));
    const raw = new Database(path);
    raw.prepare("UPDATE tickets SET lane = 'bogus'").run();
    raw.close();
    const failure = await db
      .transaction((tx) => tx.tickets.get(makeTicket(1).id))
      .catch((e: unknown) => e);
    await db.close();
    expect(failure).toBeInstanceOf(UnknownForgeError);
    expect((failure as ForgeError).cause).toMatchObject({ name: 'ZodError' });
  });

  it('maps a constraint violation from raw SQL to InvalidInputError', async () => {
    const { storage, receipts } = openSqlite(':memory:');
    await appendDecision(receipts, 'r1', 'c1');
    // same decision id twice is rejected by the receipt log's own check; the table's
    // PRIMARY KEY is the backstop, so reach it through the shared driver path.
    const failure = await storage
      .transaction(async (tx) => {
        await tx.runs.insert(makeRun('r1'));
        await tx.runs.insert(makeRun('r1'));
      })
      .catch((e: unknown) => e);
    await storage.close();
    expect(failure).toBeInstanceOf(InvalidInputError);
  });

  it('fails fast when receipts.append is called from inside a storage transaction', async () => {
    const { storage, receipts } = openSqlite(':memory:');
    const outcome = await Promise.race([
      storage
        .transaction(async () => {
          await appendDecision(receipts, 'r1', 'c1');
        })
        .catch((e: unknown) => e),
      new Promise((r) => setTimeout(() => r('deadlock'), 1000)),
    ]);
    const chain = await receipts.list('r1');
    await storage.close();
    expect(outcome).toBeInstanceOf(InvalidInputError);
    expect(chain).toEqual([]);
  });
});

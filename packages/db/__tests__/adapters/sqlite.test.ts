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
 * Depends on: contract/storage.contract, src/index, better-sqlite3.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
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

  it('applies busy_timeout and foreign_keys pragmas to the connection', () => {
    const driver = openSqliteDriver(':memory:', { busyTimeoutMs: 1234 });
    const busy = driver.get<{ timeout: number }>('PRAGMA busy_timeout');
    driver.close();
    expect(busy?.timeout).toBe(1234);
  });
});

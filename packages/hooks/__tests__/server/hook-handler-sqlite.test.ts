/**
 * Pins: the hook handler on the durable SQLite receipt log, and that no secret reaches disk.
 *
 * Why: in production receipts live in the Forge database, which a Worker running on the
 *   same machine may be able to read. The chain must still verify after a restart and
 *   under concurrent posts, and the per-run HMAC secret must never be written to the
 *   file: if it were, a Worker could forge receipts that pass the gates. The secret is
 *   supplied by `credentials()` from server memory only (verification-plane.md §2).
 *
 * Depends on: helpers/fixtures, @forge/db, @forge/tools (verifyChain), node:fs.
 */

import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSqlite } from '@forge/db';
import { verifyChain } from '@forge/tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RUN_ID, SECRET, TOKEN, makeEnv, post, pre } from '#tests/helpers/fixtures.js';

const req = (payload: { hook_event_name: string }) => ({
  event: payload.hook_event_name,
  payload,
  seq: 1,
});

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'forge-hooks-'));
  path = join(dir, 'forge.sqlite');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('hook handler over SQLite', () => {
  it('keeps one verifiable chain under concurrent posts and across a reopen', async () => {
    const env = makeEnv({ sqlitePath: path });
    await env.ready;
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        env.handler.handle(RUN_ID, TOKEN, req(pre('PowerShell', `echo ${i}`, `tu${i}`))),
      ),
    );
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        env.handler.handle(RUN_ID, TOKEN, req(post('PowerShell', `tu${i}`))),
      ),
    );
    await env.close();

    const reopened = openSqlite(path);
    const chain = await reopened.receipts.list(RUN_ID);
    await reopened.storage.close();
    expect(chain).toHaveLength(40);
    expect(verifyChain(chain, SECRET)).toEqual({ ok: true, value: 40 });
  });

  it('never writes the run secret or the raw token to the database files', async () => {
    const env = makeEnv({ sqlitePath: path });
    await env.ready;
    const r = await env.handler.handle(
      RUN_ID,
      TOKEN,
      req(pre('PowerShell', 'echo hi', 'tu1')),
    );
    const bytes = [path, `${path}-wal`]
      .filter((f) => existsSync(f))
      .map((f) => readFileSync(f).toString('latin1'))
      .join('');
    await env.close();
    // Positive control: the receipt itself is on disk, so absence of the secret means something.
    expect(bytes).toContain(r.receipt_hash);
    expect(bytes).not.toContain(SECRET);
    expect(bytes).not.toContain(TOKEN);
  });
});

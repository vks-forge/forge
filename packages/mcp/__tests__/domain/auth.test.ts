/**
 * Pins run authentication and the per-call "run still active" check.
 *
 * Why: the server is a door into Forge state. A process holding the wrong token, or a
 *   Worker that keeps calling after its run was cancelled or ended, must not be able to
 *   write comments, questions or a late `finish` into a ticket the Director has already
 *   settled. Failing at startup and on every call keeps a stale or forged Worker out. The
 *   token is checked against the hash held in storage (never the token itself), so a
 *   missing, revoked or unreadable registration must fail closed too.
 *
 * Pins: createForgeMcpServer() auth, verifyRunToken(), hashToken(), run-active check.
 * Depends on: helpers/harness, domain/run-tokens, domain/server.
 */

import { AuthError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { hashToken, verifyRunToken } from '#/domain/run-tokens.js';
import { createForgeMcpServer } from '#/domain/server.js';
import {
  RUN_ID,
  T0,
  TOKEN,
  connect,
  seedStorage,
  textOf,
} from '#tests/helpers/harness.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const start = (storage: StorageAdapter, runToken = TOKEN, runId = RUN_ID) =>
  createForgeMcpServer({ storage, runId, runToken });

describe('startup token check', () => {
  it('accepts the token registered for the run', async () => {
    const server = await start(await seedStorage());
    await server.close();
  });

  it('refuses a wrong token', async () => {
    await expect(start(await seedStorage(), 'wrong')).rejects.toBeInstanceOf(AuthError);
  });

  it('refuses a run with no registered token', async () => {
    const storage = await seedStorage();
    await storage.transaction((tx) => tx.runs.insert({ ...runRow('run-2') }));
    await expect(start(storage, TOKEN, 'run-2')).rejects.toBeInstanceOf(AuthError);
  });

  it('refuses a revoked token', async () => {
    const storage = await seedStorage();
    await storage.transaction((tx) => tx.runTokens.revoke(RUN_ID, T0));
    await expect(start(storage)).rejects.toBeInstanceOf(AuthError);
  });

  it('refuses a run that does not exist', async () => {
    const storage = await seedStorage();
    await storage.transaction((tx) => tx.runTokens.put('run-404', hashToken(TOKEN), T0));
    await expect(start(storage, TOKEN, 'run-404')).rejects.toBeInstanceOf(AuthError);
  });

  it('refuses to start for a run that is not running', async () => {
    const storage = await seedStorage();
    await storage.transaction((tx) => tx.runs.update(RUN_ID, { status: 'cancelled' }));
    await expect(start(storage)).rejects.toBeInstanceOf(AuthError);
  });
});

function runRow(id: string) {
  return {
    id,
    ticket_id: 'SF-1',
    harness: 'fake',
    driver_version: '0.0.0',
    cwd: '/tmp/work',
    lane: 'standard' as const,
    started_at: T0,
    status: 'running' as const,
  };
}

describe('every call re-checks the run', () => {
  it('turns tool calls into errors once the run has ended', async () => {
    const c = await connect();
    close = c.close;
    const before = await c.client.callTool({
      name: 'add_comment',
      arguments: { ticket: 'SF-1', text: 'ok' },
    });
    expect(before.isError).toBeFalsy();
    await c.storage.transaction((tx) =>
      tx.runs.update(RUN_ID, { status: 'success', ended_at: '2026-10-13T01:00:00.000Z' }),
    );
    const after = await c.client.callTool({
      name: 'add_comment',
      arguments: { ticket: 'SF-1', text: 'late' },
    });
    expect(after.isError).toBe(true);
    expect(textOf(after)).toMatch(/not running/i);
  });
});

describe('verifyRunToken', () => {
  it('verifies only the stored token', async () => {
    const storage = await seedStorage();
    expect(await verifyRunToken(storage, RUN_ID, TOKEN)).toBe(true);
    expect(await verifyRunToken(storage, RUN_ID, TOKEN + 'x')).toBe(false);
    expect(await verifyRunToken(storage, RUN_ID, '')).toBe(false);
    expect(await verifyRunToken(storage, 'other', TOKEN)).toBe(false);
  });

  it('fails closed when storage throws', async () => {
    const broken = {
      transaction: async () => {
        throw new Error('db down');
      },
      close: async () => undefined,
    } as StorageAdapter;
    expect(await verifyRunToken(broken, RUN_ID, TOKEN)).toBe(false);
  });

  it('fails closed on a malformed stored hash', async () => {
    const storage = await seedStorage();
    const odd = {
      transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ runTokens: { getHash: async () => 'not-hex' } }),
      close: async () => undefined,
    } as unknown as StorageAdapter;
    expect(await verifyRunToken(odd, RUN_ID, TOKEN)).toBe(false);
    expect(await verifyRunToken(storage, RUN_ID, TOKEN)).toBe(true);
  });

  it('hashToken is a stable sha256 hex', () => {
    expect(hashToken('a')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('a')).toBe(hashToken('a'));
  });
});

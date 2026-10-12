/**
 * Pins run authentication and the per-call "run still active" check.
 *
 * Why: the server is a door into Forge state. A process holding the wrong token, or a
 *   Worker that keeps calling after its run was cancelled or ended, must not be able to
 *   write comments, questions or a late `finish` into a ticket the Director has already
 *   settled. Failing at startup and on every call keeps a stale or forged Worker out.
 *
 * Pins: createForgeMcpServer() auth, createRunTokenAuthority(), run-active check.
 * Depends on: helpers/harness, domain/run-tokens, domain/server.
 */

import { AuthError } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMemoryTokenStore,
  createRunTokenAuthority,
  hashToken,
} from '#/domain/run-tokens.js';
import { createForgeMcpServer } from '#/domain/server.js';
import { RUN_ID, TOKEN, connect, seedStorage, textOf } from '#tests/helpers/harness.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function authority(runId = RUN_ID, token = TOKEN) {
  const store = createMemoryTokenStore();
  await store.register(runId, token);
  return createRunTokenAuthority(store);
}

describe('startup token check', () => {
  it('refuses a wrong token', async () => {
    await expect(
      createForgeMcpServer({
        storage: await seedStorage(),
        runId: RUN_ID,
        runToken: 'wrong',
        tokens: await authority(),
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('refuses a run with no registered token and a run that does not exist', async () => {
    const storage = await seedStorage();
    await expect(
      createForgeMcpServer({
        storage,
        runId: RUN_ID,
        runToken: TOKEN,
        tokens: createRunTokenAuthority(createMemoryTokenStore()),
      }),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      createForgeMcpServer({
        storage,
        runId: 'run-404',
        runToken: TOKEN,
        tokens: await authority('run-404'),
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('refuses to start for a run that is not running', async () => {
    const storage = await seedStorage();
    await storage.transaction((tx) => tx.runs.update(RUN_ID, { status: 'cancelled' }));
    await expect(
      createForgeMcpServer({
        storage,
        runId: RUN_ID,
        runToken: TOKEN,
        tokens: await authority(),
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

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

describe('createRunTokenAuthority', () => {
  it('verifies only the registered token', async () => {
    const tokens = await authority();
    expect(await tokens.verify(RUN_ID, TOKEN)).toBe(true);
    expect(await tokens.verify(RUN_ID, TOKEN + 'x')).toBe(false);
    expect(await tokens.verify(RUN_ID, '')).toBe(false);
    expect(await tokens.verify('other', TOKEN)).toBe(false);
  });

  it('fails closed when the store throws', async () => {
    const tokens = createRunTokenAuthority({
      getTokenHash: async () => {
        throw new Error('db down');
      },
    });
    expect(await tokens.verify(RUN_ID, TOKEN)).toBe(false);
  });

  it('hashToken is a stable sha256 hex', () => {
    expect(hashToken('a')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('a')).toBe(hashToken('a'));
  });
});

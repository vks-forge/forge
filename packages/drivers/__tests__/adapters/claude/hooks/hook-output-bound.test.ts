/**
 * Pins: the hook client never posts an oversized tool output whole.
 *
 * Why: a file read can return tens of MiB, and the server rejects a hook request over its
 * body limit. The rejection reaches the harness as a failed hook, so a perfectly allowed
 * read would look like a broken tool. The client therefore replaces an output over 1 MiB
 * with a bounded prefix plus the hash and size of the whole, computed locally, so the
 * server's effect receipt still binds the complete output.
 *
 * Depends on: helpers/http-server, helpers/hook-fixtures, src/adapters/claude/hooks/hook-main.
 */

import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { boundOutput, runHook } from '#/adapters/claude/hooks/hook-main.js';
import { failure, post } from '#tests/helpers/hook-fixtures.js';
import { startServer } from '#tests/helpers/http-server.js';
import type { TestServer } from '#tests/helpers/http-server.js';

const allow = JSON.stringify({ decision: 'allow', reason: 'r', receipt_hash: '' });
let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function postedBody(payload: unknown): Promise<Record<string, unknown>> {
  server = await startServer({ body: allow });
  const cfg = { run_id: 'r', server_url: server.url, token: 't', timeout_ms: 5000 };
  const result = await runHook({
    stdin: JSON.stringify(payload),
    env: { FORGE_HOOK_CONFIG: '/c.json' },
    argv: [],
    fetch: (u, i) => fetch(u, i),
    readFile: async () => JSON.stringify(cfg),
    now: () => 1,
  });

  expect(result.exitCode).toBe(0);

  return JSON.parse(server.seen[0]?.body ?? '{}') as Record<string, unknown>;
}

const big = { stdout: 'x'.repeat(3 * 1024 * 1024) };

describe('boundOutput', () => {
  it('returns a small output unchanged', () => {
    const small = { stdout: 'hi' };

    expect(boundOutput(small)).toBe(small);
    expect(boundOutput(undefined)).toBeUndefined();
  });

  it('replaces a large output with a prefix, its size and the hash of the whole', () => {
    const json = JSON.stringify(big);
    const out = boundOutput(big) as Record<string, unknown>;

    expect(out).toMatchObject({
      truncated: true,
      bytes: Buffer.byteLength(json),
      sha256: createHash('sha256').update(json).digest('hex'),
    });

    expect((out['prefix'] as string).length).toBeLessThanOrEqual(16 * 1024);
    expect(json.startsWith(out['prefix'] as string)).toBe(true);
  });
});

describe('runHook with a large tool output', () => {
  it('posts a small request for a PostToolUse with a 3 MiB response', async () => {
    const body = await postedBody({ ...post('Read', 'tu1'), tool_response: big });
    const payload = body['payload'] as Record<string, unknown>;

    expect(server?.seen[0]?.body.length).toBeLessThan(64 * 1024);
    expect(payload['tool_response']).toMatchObject({ truncated: true });
    expect(payload['tool_use_id']).toBe('tu1');
  });

  it('bounds the error of a PostToolUseFailure too', async () => {
    const body = await postedBody({ ...failure('Read', 'tu2'), error: big });

    expect((body['payload'] as Record<string, unknown>)['error']).toMatchObject({
      truncated: true,
    });
  });

  it('leaves a normal response as it was', async () => {
    const body = await postedBody(post('Read', 'tu3'));

    expect((body['payload'] as Record<string, unknown>)['tool_response']).toEqual({
      stdout: 'hi',
    });
  });
});

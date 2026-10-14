/**
 * Pins: an effect receipt binds the whole tool output even when the hook truncated it.
 *
 * Why: the hook client replaces an output over 1 MiB with a prefix plus the SHA-256 of the
 * full serialization. The effect receipt's `result_hash` is how a gate or a reviewer later
 * proves what came back, so for a truncated output it must be the client's hash of the
 * whole, not a hash of the stub; an ordinary output keeps the canonical-JSON hash.
 *
 * Depends on: helpers/fixtures, src/shared/args-hash. No IO.
 */

import { describe, expect, it } from 'vitest';
import { argsHash, resultHash } from '#/shared/args-hash.js';
import { RUN_ID, TOKEN, makeEnv, pre } from '#tests/helpers/fixtures.js';

const FULL = 'ab'.repeat(32);
const stub = { truncated: true, bytes: 5_000_000, sha256: FULL, prefix: '{"stdout":"xx' };

describe('resultHash', () => {
  it('uses the hash inside a truncated-output stub', () => {
    expect(resultHash(stub)).toBe(FULL);
  });

  it('hashes an ordinary output canonically', () => {
    expect(resultHash({ stdout: 'hi' })).toBe(argsHash({ stdout: 'hi' }));
  });

  it('does not trust a stub-shaped object with a malformed hash', () => {
    const forged = { ...stub, sha256: 'nope' };

    expect(resultHash(forged)).toBe(argsHash(forged));
  });
});

describe('hook handler: effect of a truncated output', () => {
  it('records the full-output hash as the effect result_hash', async () => {
    const env = makeEnv();
    await env.ready;
    const req = (payload: { hook_event_name: string }) => ({
      event: payload.hook_event_name,
      payload,
      seq: 1,
    });

    await env.handler.handle(RUN_ID, TOKEN, req(pre('Bash', 'ls', 'tu1')));
    await env.handler.handle(
      RUN_ID,
      TOKEN,
      req({
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: {},
        tool_use_id: 'tu1',
        tool_response: stub,
      } as { hook_event_name: string }),
    );

    const effect = (await env.receipts.list(RUN_ID)).find((r) => r.kind === 'effect');

    expect(effect).toMatchObject({ result_hash: FULL });
  });
});

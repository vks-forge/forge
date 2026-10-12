/**
 * Pins: hook handler writes a verifiable receipt chain and fails closed.
 *
 * Why: the gates trust receipts only if the chain verifies and a Worker cannot get an
 * allow by guessing, replaying or racing. These tests pin that: chain grows and verifies,
 * tampering is detected, bad token / unknown run / thrown policy deny, and `seq` is
 * gap-free under 20 simultaneous posts.
 *
 * Depends on: helpers/fixtures, @forge/tools (verifyChain).
 */

import { verifyChain } from '@forge/tools';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RUN_ID,
  SECRET,
  TOKEN,
  failure,
  makeEnv,
  post,
  pre,
  sessionStart,
} from '#tests/helpers/fixtures.js';

const req = (payload: { hook_event_name: string }) => ({
  event: payload.hook_event_name,
  payload,
  seq: 1,
});

let env: ReturnType<typeof makeEnv>;
beforeEach(async () => {
  env = makeEnv();
  await env.ready;
});

describe('hook handler', () => {
  it('allows, chains decision then effect, and the chain verifies', async () => {
    const a = await env.handler.handle(
      RUN_ID,
      TOKEN,
      req(pre('PowerShell', 'echo hi', 'tu1')),
    );
    const b = await env.handler.handle(RUN_ID, TOKEN, req(post('PowerShell', 'tu1')));
    const c = await env.handler.handle(RUN_ID, TOKEN, req(pre('Bash', 'ls', 'tu2')));
    const chain = await env.receipts.list(RUN_ID);
    expect(a.decision).toBe('allow');
    expect(b.reason).toBe('effect_recorded');
    expect(c.decision).toBe('allow'); // stub policy; Bash passes through under its raw name
    expect(chain.map((r) => r.kind)).toEqual(['decision', 'effect', 'decision']);
    expect(a.receipt_hash).toBe(chain[0]?.hash);
    expect(verifyChain(chain, SECRET).ok).toBe(true);
    expect(env.admitted[0]).toMatchObject({ tool: 'shell', native: 'PowerShell' });
    expect(env.admitted[1]).toMatchObject({ tool: 'Bash' });
  });

  it('detects a tampered row', async () => {
    await env.handler.handle(RUN_ID, TOKEN, req(pre()));
    await env.handler.handle(RUN_ID, TOKEN, req(pre('PowerShell', 'echo 2')));
    const chain = [...(await env.receipts.list(RUN_ID))];
    chain[0] = { ...chain[0]!, reason: 'forged' } as never;
    expect(verifyChain(chain, SECRET).ok).toBe(false);
  });

  it('returns the policy deny with its receipt', async () => {
    const r = await env.handler.handle(RUN_ID, TOKEN, req(pre('PowerShell', 'deny me')));
    expect(r).toMatchObject({ decision: 'deny', reason: 'rule_deny' });
    expect(r.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('marks failures uncertain and failed reads as no effect', async () => {
    await env.handler.handle(RUN_ID, TOKEN, req(pre('PowerShell', 'x', 'u1')));
    await env.handler.handle(RUN_ID, TOKEN, req(failure('PowerShell', 'u1')));
    await env.handler.handle(RUN_ID, TOKEN, req(pre('Read', 'x', 'u2')));
    await env.handler.handle(RUN_ID, TOKEN, req(failure('Read')));
    const states = (await env.receipts.list(RUN_ID)).flatMap((r) =>
      r.kind === 'effect' ? [r.state] : [],
    );
    expect(states).toEqual(['uncertain', 'failed_no_effect']);
  });

  it('allows an unmatched PostToolUse without writing', async () => {
    const r = await env.handler.handle(RUN_ID, TOKEN, req(post()));
    expect(r).toMatchObject({
      decision: 'allow',
      reason: 'effect_unmatched',
      receipt_hash: '',
    });
    expect(await env.receipts.list(RUN_ID)).toHaveLength(0);
  });

  it('registers liveness on SessionStart', async () => {
    const r = await env.handler.handle(RUN_ID, TOKEN, req(sessionStart()));
    expect(r).toMatchObject({ decision: 'allow', reason: 'liveness_registered' });
    expect(env.liveness).toEqual([RUN_ID]);
  });

  it('denies a bad token and leaves one audit receipt', async () => {
    const r = await env.handler.handle(RUN_ID, 'nope', req(pre()));
    expect(r.reason).toBe('fail_closed_bad_token');
    const chain = await env.receipts.list(RUN_ID);
    expect(chain).toHaveLength(1);
    expect(verifyChain(chain, SECRET).ok).toBe(true);
  });

  it('denies an unknown run and writes nothing', async () => {
    const r = await env.handler.handle('ghost', TOKEN, req(pre()));
    expect(r.reason).toBe('fail_closed_unknown_run');
    expect(await env.receipts.list('ghost')).toHaveLength(0);
  });

  it('denies a malformed request', async () => {
    const r = await env.handler.handle(RUN_ID, TOKEN, {
      event: 'PreToolUse',
      payload: {},
      seq: 1,
    });
    expect(r.reason).toBe('fail_closed_bad_request');
  });

  it('denies and audits when the policy throws', async () => {
    const bad = makeEnv({ throwOnAdmit: true });
    await bad.ready;
    const r = await bad.handler.handle(RUN_ID, TOKEN, req(pre()));
    expect(r.reason).toBe('fail_closed_internal');
    expect(await bad.receipts.list(RUN_ID)).toHaveLength(1);
  });

  it('keeps seq strictly increasing under 20 concurrent posts', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        env.handler.handle(RUN_ID, TOKEN, req(pre('PowerShell', `echo ${i}`))),
      ),
    );
    const chain = await env.receipts.list(RUN_ID);
    const seqs = chain.flatMap((r) => (r.kind === 'decision' ? [r.seq] : []));
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(verifyChain(chain, SECRET).ok).toBe(true);
  });
});

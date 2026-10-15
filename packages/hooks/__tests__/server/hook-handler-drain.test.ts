/**
 * Pins: the hook handler while the server drains for a graceful stop.
 *
 * Why: `forge stop` waits for tool calls that are already running to record their effect
 *   receipt, so the resumed Worker's claim for that edit is supported (d-0092). That wait only
 *   ends if no new call starts meanwhile: a draining server must refuse new PreToolUse posts,
 *   with a reason the harness can retry after the resume, while still recording the effect of
 *   every call it had already allowed. The refusal is receipted: the harness reports the refused
 *   call with an error result, and G1 fails a reported call that has no decision receipt.
 *
 * Depends on: helpers/fixtures, src/server/open-calls.
 */

import { describe, expect, it } from 'vitest';
import { linkResumedGeneration, openToolCalls } from '#/index.js';
import { RUN_ID, TOKEN, makeEnv, post, pre } from '#tests/helpers/fixtures.js';

const req = (payload: { hook_event_name: string }) => ({
  event: payload.hook_event_name,
  payload,
  seq: 1,
});

describe('hook handler while draining', () => {
  it('denies a new PreToolUse with server_draining and receipts the refusal without asking policy', async () => {
    const env = makeEnv({ draining: () => true });
    await env.ready;

    const answer = await env.handler.handle(RUN_ID, TOKEN, req(pre('Edit', 'x', 'u1')));

    expect(answer).toMatchObject({ decision: 'deny', reason: 'server_draining' });
    expect(answer.receipt_hash).not.toBe('');

    const chain = await env.receipts.list(RUN_ID);
    expect(chain).toEqual([
      expect.objectContaining({
        kind: 'decision',
        id: 'u1',
        decision: 'deny',
        reason: 'server_draining',
      }),
    ]);

    // A refused call is never in flight: there is no effect to wait for.
    expect(openToolCalls(chain)).toEqual([]);
    expect(env.admitted).toEqual([]);
  });

  it('still records the effect of a call allowed before the drain began', async () => {
    let draining = false;
    const env = makeEnv({ draining: () => draining });
    await env.ready;
    await env.handler.handle(RUN_ID, TOKEN, req(pre('Edit', 'x', 'u1')));
    expect(openToolCalls(await env.receipts.list(RUN_ID))).toEqual(['u1']);

    draining = true;
    const answer = await env.handler.handle(RUN_ID, TOKEN, req(post('Edit', 'u1')));

    expect(answer.reason).toBe('effect_recorded');
    expect(openToolCalls(await env.receipts.list(RUN_ID))).toEqual([]);
  });

  it('admits calls again once the drain flag is off', async () => {
    const env = makeEnv({ draining: () => false });
    await env.ready;

    const answer = await env.handler.handle(RUN_ID, TOKEN, req(pre('Edit', 'x', 'u1')));

    expect(answer.decision).toBe('allow');
  });
});

describe('openToolCalls', () => {
  it('lists allowed decisions that have no effect yet, and ignores denied ones', async () => {
    const env = makeEnv();
    await env.ready;
    await env.handler.handle(RUN_ID, TOKEN, req(pre('Edit', 'x', 'u1')));
    await env.handler.handle(RUN_ID, TOKEN, req(pre('Edit', 'deny this', 'u2')));
    await env.handler.handle(RUN_ID, TOKEN, req(pre('Edit', 'y', 'u3')));
    await env.handler.handle(RUN_ID, TOKEN, req(post('Edit', 'u1')));

    expect(openToolCalls(await env.receipts.list(RUN_ID))).toEqual(['u3']);
  });

  it('ignores a call left open by a Worker that a resume has since replaced', async () => {
    const env = makeEnv();
    await env.ready;
    await env.handler.handle(RUN_ID, TOKEN, req(pre('Edit', 'x', 'u1')));
    await linkResumedGeneration(
      env.receipts,
      RUN_ID,
      2,
      'generation-two-secret-0123456789abcdef',
      '2026-10-14T00:00:00.000Z',
    );

    expect(openToolCalls(await env.receipts.list(RUN_ID))).toEqual([]);
  });
});

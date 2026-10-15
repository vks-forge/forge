/**
 * Pins: the hook handler across a resume (new run token, secret and generation).
 *
 * Why: after a restart the Worker is replaced, and the server must stop honouring the old
 * one (d-0092, d-0100). The old token must be refused, credentials of another generation
 * must not write into the run's chain, an interrupted run must get no receipts until it is
 * running again, and the first receipt of the new generation must chain from the `resumed`
 * link so gate G1 can verify the run segment by segment. If any of these slipped, a stale
 * process could keep signing receipts for a run that has moved on.
 *
 * Depends on: helpers/fixtures, src/server/resume-link, @forge/tools (verifyGenerations).
 */

import { verifyGenerations } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { linkResumedGeneration } from '#/index.js';
import {
  RUN_ID,
  SECRET,
  TOKEN,
  makeEnv,
  post,
  pre,
  sessionStart,
} from '#tests/helpers/fixtures.js';

const SECRET_2 = 'generation-two-secret-0123456789abcdef';
const TOKEN_2 = 'bearer-second-generation';
const TS = '2026-10-14T00:00:00.000Z';
const req = (payload: { hook_event_name: string }) => ({
  event: payload.hook_event_name,
  payload,
  seq: 1,
});

const secretFor = (g: number): string | null =>
  g === 1 ? SECRET : g === 2 ? SECRET_2 : null;

/** An env whose run is in generation 2 with generation 2's credentials. */
async function resumedEnv() {
  const env = makeEnv({
    run: { generation: 2 },
    credentials: async () => ({ token: TOKEN_2, secret: SECRET_2, generation: 2 }),
  });

  await env.ready;

  return env;
}

describe('hook handler across a resume', () => {
  it('chains the new generation from the resumed link and the whole chain verifies', async () => {
    const first = makeEnv();
    await first.ready;
    await first.handler.handle(RUN_ID, TOKEN, req(pre('PowerShell', 'echo 1', 'u1')));
    await first.handler.handle(RUN_ID, TOKEN, req(post('PowerShell', 'u1')));

    await linkResumedGeneration(first.receipts, RUN_ID, 2, SECRET_2, TS);
    const resumed = makeEnv({
      run: { generation: 2 },
      credentials: async () => ({ token: TOKEN_2, secret: SECRET_2, generation: 2 }),
    });

    // The same receipt log, as after a restart over the same database.
    const handler = resumed.handler;
    await resumed.ready;
    for (const r of await first.receipts.list(RUN_ID)) {
      await resumed.receipts.append(RUN_ID, () => [r]);
    }

    const answer = await handler.handle(
      RUN_ID,
      TOKEN_2,
      req(pre('PowerShell', 'echo 2', 'u2')),
    );

    expect(answer.decision).toBe('allow');
    const chain = await resumed.receipts.list(RUN_ID);
    expect(chain.map((r) => r.kind)).toEqual([
      'decision',
      'effect',
      'resumed',
      'decision',
    ]);

    expect(verifyGenerations(chain, secretFor)).toEqual({
      ok: true,
      value: { receipts: 4, generations: 2 },
    });
  });

  it('refuses the old generation token with bad_token and writes nothing', async () => {
    const env = await resumedEnv();

    const r = await env.handler.handle(
      RUN_ID,
      TOKEN,
      req(pre('PowerShell', 'echo', 'u1')),
    );

    expect(r).toMatchObject({ decision: 'deny', reason: 'fail_closed_bad_token' });
    expect(await env.receipts.list(RUN_ID)).toEqual([]);
  });

  it('refuses credentials of another generation than the run row with stale_generation', async () => {
    const env = makeEnv({
      run: { generation: 3 },
      credentials: async () => ({ token: TOKEN_2, secret: SECRET_2, generation: 2 }),
    });

    await env.ready;

    const r = await env.handler.handle(
      RUN_ID,
      TOKEN_2,
      req(pre('PowerShell', 'echo', 'u1')),
    );

    expect(r).toMatchObject({ decision: 'deny', reason: 'fail_closed_stale_generation' });
    expect(await env.receipts.list(RUN_ID)).toEqual([]);
  });

  it('gives an interrupted run no receipts and no liveness, even with the right token', async () => {
    const env = makeEnv({ run: { status: 'interrupted' } });
    await env.ready;

    const a = await env.handler.handle(
      RUN_ID,
      TOKEN,
      req(pre('PowerShell', 'echo', 'u1')),
    );

    const b = await env.handler.handle(RUN_ID, TOKEN, req(sessionStart()));

    expect(a.reason).toBe('fail_closed_inactive_run');
    expect(b.reason).toBe('fail_closed_inactive_run');
    expect(env.liveness).toEqual([]);
    expect(await env.receipts.list(RUN_ID)).toEqual([]);
  });

  it('treats a run row without a generation as generation 1', async () => {
    const env = makeEnv();
    await env.ready;

    const r = await env.handler.handle(
      RUN_ID,
      TOKEN,
      req(pre('PowerShell', 'echo', 'u1')),
    );

    expect(r.decision).toBe('allow');
  });
});

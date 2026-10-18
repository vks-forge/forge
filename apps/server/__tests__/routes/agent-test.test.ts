/**
 * The Test agent route: `POST /agents/test`.
 *
 * Why: before trusting an agent with a ticket the owner tries it with one capped call. It must run
 *   only on a harness that is ready (409 otherwise, with the reason), only one at a time per harness
 *   so a double click cannot spend twice, send the agent's model and instructions with the fixed cap,
 *   and bring a failed call back as a result the screen can explain, never as an error. A test never
 *   writes settings.
 *
 * Pins: the capped tool-less request; no model on the harness default; 409 harness_not_ready for a
 *   paused or missing harness; ok:false with a family; a throwing probe; 409 test_in_progress and the
 *   slot freed afterwards; reply truncation; nothing saved.
 * Depends on: helpers/agent-rig. IO: a loopback socket.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig | undefined;

const start = async (
  opts: Parameters<typeof startAgentRig>[0] = {},
): Promise<AgentRig> => {
  rig = await startAgentRig(opts);

  return rig;
};

const call = (r: AgentRig, method: string, path: string, body?: unknown) =>
  r.http.json(method, path, body);

const errorOf = (r: {
  body: unknown;
}): { code: string; issues?: { path: string; message: string }[] } =>
  (r.body as { error: { code: string; issues?: { path: string; message: string }[] } })
    .error;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

describe('POST /agents/test', () => {
  const test = (r: AgentRig, over: Record<string, unknown> = {}) =>
    call(r, 'POST', '/agents/test', { agent: agentBody(over) });

  it('runs one capped tool-less probe with the agent model and instructions and returns ok', async () => {
    const r = await start();
    const res = await test(r, {
      instructions: 'Rule one: be brief.',
      runs_on: {
        harness: 'project_default',
        model: { kind: 'model', id: 'haiku' },
        fallbacks: [],
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      harness_id: 'claude-code',
      model_used: 'sonnet',
      cost_usd: 0.01,
      duration_ms: 12,
    });

    expect(r.probes).toHaveLength(1);
    expect(r.probes[0]).toMatchObject({
      model: 'haiku',
      instructions: 'Rule one: be brief.',
      timeoutMs: 60_000,
      prompt: 'In one line, state your role and the first rule in your instructions.',
    });
  });

  it('sends no model for an agent that follows the harness default', async () => {
    const r = await start();
    await test(r);

    expect('model' in (r.probes[0] ?? {})).toBe(false);
    expect('maxUsd' in (r.probes[0] ?? {})).toBe(false);
  });

  it('answers 409 harness_not_ready for a paused harness and makes no call', async () => {
    const r = await start();
    await r.storage.transaction((tx) =>
      tx.harnessState.upsert({
        harness_id: 'claude-code',
        paused_until: '2026-10-17T14:30:00.000Z',
        reason: 'Out of quota',
        updated_at: '2026-10-17T11:00:00.000Z',
      }),
    );

    const res = await test(r);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('harness_not_ready');
    expect(r.probes).toHaveLength(0);
  });

  it('answers 409 harness_not_ready for a harness this server does not have', async () => {
    const r = await start();
    const res = await test(r, {
      runs_on: { harness: 'ghost', model: { kind: 'harness_default' }, fallbacks: [] },
    });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('harness_not_ready');
  });

  it('returns a failed probe as 200 ok:false with the error family', async () => {
    const r = await start();
    r.probeWith(async () => ({
      ok: false,
      durationMs: 5,
      error: { family: 'quota', message: 'no available quota' },
    }));

    const res = await test(r);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, error: { family: 'quota' } });
  });

  it('returns a probe that throws as ok:false crash instead of an HTTP error', async () => {
    const r = await start();
    r.probeWith(async () => {
      throw new Error('boom');
    });

    const res = await test(r);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: false,
      error: { family: 'crash', message: 'boom' },
    });
  });

  it('allows one test per harness at a time and frees the slot afterwards', async () => {
    const r = await start();
    let release: () => void = () => undefined;
    r.probeWith(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, reply: 'done', durationMs: 1 });
        }),
    );

    const first = test(r);
    while (r.probes.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const second = await test(r);

    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe('test_in_progress');

    release();

    expect((await first).status).toBe(200);
    r.probeWith(async () => ({ ok: true, durationMs: 1 }));

    expect((await test(r)).status).toBe(200);
  });

  it('truncates a long reply to 2000 characters', async () => {
    const r = await start();
    r.probeWith(async () => ({ ok: true, reply: 'x'.repeat(5000), durationMs: 1 }));

    const res = await test(r);

    expect((res.body as { reply: string }).reply).toHaveLength(2000);
  });

  it('keeps saving separate: a test never writes settings', async () => {
    const r = await start();
    await test(r);

    expect((await r.config.history('company')).length).toBe(0);
  });
});

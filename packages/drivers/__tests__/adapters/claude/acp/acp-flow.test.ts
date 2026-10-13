/**
 * Pins: ACP event normalisation, the permission handler, the receipt cross-check, steering
 * and cancel.
 *
 * Why: these are the rules that keep a Worker inside policy. Permission is answered from
 * the hook's recorded decision and never decided twice (one door); a tool call with no
 * receipt means the hook was bypassed and kills the run; steering uses the adapter's
 * native path only where it is declared; cancel must reach the whole process tree.
 *
 * Depends on: helpers/claude-rigs, helpers/fake-acp-agent, helpers/fake-receipts.
 */

import { RunEvent } from '@forge/core';
import { canonicalJson, sha256Hex } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import type { PromptContext } from '#tests/helpers/fake-acp-agent.js';
import { waitFor } from '#tests/helpers/wait-for.js';

const promptSeen = (rig: ReturnType<typeof makeAcpRig>) => () =>
  rig.agents[0]?.methods().includes('session/prompt') ?? false;
const receiptAsked = (rig: ReturnType<typeof makeAcpRig>) => () =>
  rig.receipts.asked.length > 0;

const bash = (id: string, command = 'echo hi') => ({
  toolCallId: id,
  name: 'Bash',
  title: command,
  rawInput: { command },
});

async function events(rig: ReturnType<typeof makeAcpRig>, runId = 'run-1') {
  const out: RunEvent[] = [];
  for await (const e of rig.driver.events({ runId })) out.push(e);
  return out;
}

const selected = (r: unknown): string | undefined =>
  (r as { outcome?: { optionId?: string } }).outcome?.optionId;

describe('ACP engine: update normalisation (rule 5)', () => {
  it('maps text, tool calls and results, a session event and usage; drops unknown kinds', async () => {
    const rig = makeAcpRig();
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        await ctx.update({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'hi' },
        });
        await ctx.update({ sessionUpdate: 'tool_call', ...bash('t1') });
        await ctx.update({
          sessionUpdate: 'tool_call_update',
          toolCallId: 't1',
          status: 'completed',
          rawOutput: 'out',
        });
        await ctx.update({ sessionUpdate: 'plan', entries: [] });
        await ctx.update({
          sessionUpdate: 'usage_update',
          used: 5,
          size: 100,
          cost: { amount: 0.02, currency: 'USD' },
        });
        return {
          stopReason: 'end_turn',
          usage: {
            totalTokens: 30,
            inputTokens: 20,
            outputTokens: 10,
            cachedReadTokens: 4,
            cachedWriteTokens: 2,
          },
        };
      },
    };
    const h = await rig.driver.start(rig.request());
    const result = await rig.driver.result(h);
    const all = await events(rig);
    expect(all.map((e) => e.type)).toEqual([
      'session',
      'text',
      'tool_call',
      'tool_result',
      'usage',
    ]);
    expect(all[2]).toMatchObject({
      call_id: 't1',
      name: 'Bash',
      input: { command: 'echo hi' },
    });
    expect(all[3]).toMatchObject({ call_id: 't1', output: 'out', is_error: false });
    expect(result).toMatchObject({
      status: 'success',
      session: 'sess-1',
      costUsd: 0.02,
      usage: { in: 20, out: 10, cachedIn: 4, cacheWrite: 2 },
      filesTouched: ['src/a.ts'],
    });
    expect(rig.logs.some((l) => l.level === 'debug' && l.message.includes('plan'))).toBe(
      true,
    );
  });
});

describe('ACP engine: permission handler answers from receipts (one door)', () => {
  async function ask(
    rig: ReturnType<typeof makeAcpRig>,
    id: string,
  ): Promise<{ answer: string | undefined; evs: RunEvent[] }> {
    let answer: string | undefined;
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx: PromptContext) => {
        answer = selected(await ctx.permission(bash(id)));
        return { stopReason: 'end_turn' };
      },
    };
    const h = await rig.driver.start(rig.request());
    await rig.driver.result(h);
    return { answer, evs: await events(rig) };
  }

  it('allows once only for a recorded allow, and echoes the verdict as a permission event', async () => {
    const rig = makeAcpRig();
    rig.receipts.allowAll = false;
    rig.receipts.record('p1', 'allow', 'shell');
    const { answer, evs } = await ask(rig, 'p1');
    expect(answer).toBe('allow-once');
    expect(evs.find((e) => e.type === 'permission')).toMatchObject({
      call_id: 'p1',
      tool: 'shell',
      decision: 'allow',
    });
    const asked = rig.receipts.asked[0];
    expect(asked).toMatchObject({ runId: 'run-1', id: 'p1' });
    expect(asked?.match).toEqual({
      name: 'Bash',
      argsHash: sha256Hex(canonicalJson({ command: 'echo hi' })),
    });
  });

  it('rejects a recorded deny and a recorded ask without calling admit', async () => {
    for (const verdict of ['deny', 'ask'] as const) {
      const rig = makeAcpRig();
      rig.receipts.allowAll = false;
      rig.receipts.record('p2', verdict);
      const { answer, evs } = await ask(rig, 'p2');
      expect(answer).toBe('reject');
      expect(evs.find((e) => e.type === 'permission')).toMatchObject({
        decision: verdict,
      });
    }
  });

  it('rejects with a policy_denied error event when no decision exists after the grace window', async () => {
    const rig = makeAcpRig({ receiptCrossCheck: false });
    rig.receipts.allowAll = false;
    const pending = ask(rig, 'p3');
    await waitFor(receiptAsked(rig), 'receipt lookup');
    await rig.clock.advance(3_000);
    const { answer, evs } = await pending;
    expect(answer).toBe('reject');
    expect(evs.find((e) => e.type === 'error')).toMatchObject({
      family: 'policy_denied',
    });
    expect(evs.find((e) => e.type === 'permission')).toMatchObject({ decision: 'deny' });
  });
});

describe('ACP engine: receipt cross-check', () => {
  const hangAfterToolCall = {
    auth: 'account' as const,
    onPrompt: async (ctx: PromptContext) => {
      await ctx.update({ sessionUpdate: 'tool_call', ...bash('ghost') });
      await ctx.cancelled;
      return { stopReason: 'cancelled' as const };
    },
  };

  it('cancels the run as policy_denied when a tool call has no receipt within the grace window', async () => {
    const rig = makeAcpRig();
    rig.receipts.allowAll = false;
    rig.next = hangAfterToolCall;
    const h = await rig.driver.start(rig.request());
    await waitFor(receiptAsked(rig), 'receipt lookup');
    await rig.clock.advance(3_000);
    const result = await rig.driver.result(h);
    expect(result).toMatchObject({ status: 'error', errorFamily: 'policy_denied' });
    expect(rig.agents[0]?.methods()).toContain('session/cancel');
    const err = (await events(rig)).find((e) => e.type === 'error');
    expect(err).toMatchObject({ family: 'policy_denied' });
    expect(err && 'message' in err ? err.message : '').toContain('ghost');
  });

  it('lets a receipted call through, even when the receipt arrives inside the window', async () => {
    const rig = makeAcpRig();
    rig.receipts.allowAll = false;
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        await ctx.update({ sessionUpdate: 'tool_call', ...bash('late') });
        return { stopReason: 'end_turn' };
      },
    };
    const h = await rig.driver.start(rig.request());
    await waitFor(receiptAsked(rig), 'receipt lookup');
    await rig.clock.advance(400);
    rig.receipts.record('late', 'allow');
    await rig.clock.advance(3_000);
    expect((await rig.driver.result(h)).status).toBe('success');
  });

  it('joins on (tool name, args hash) when the hook recorded the call under a different id', async () => {
    const rig = makeAcpRig();
    rig.receipts.allowAll = false;
    rig.receipts.recordByMatch(
      { name: 'Bash', argsHash: sha256Hex(canonicalJson({ command: 'echo hi' })) },
      'allow',
    );
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        await ctx.update({ sessionUpdate: 'tool_call', ...bash('acp-id') });
        return { stopReason: 'end_turn' };
      },
    };
    const h = await rig.driver.start(rig.request());
    expect((await rig.driver.result(h)).status).toBe('success');
  });

  it('is off when receiptCrossCheck is false', async () => {
    const rig = makeAcpRig({ receiptCrossCheck: false });
    rig.receipts.allowAll = false;
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        await ctx.update({ sessionUpdate: 'tool_call', ...bash('x') });
        return { stopReason: 'end_turn' };
      },
    };
    const h = await rig.driver.start(rig.request());
    expect((await rig.driver.result(h)).status).toBe('success');
  });
});

describe('ACP engine: steering (rule 6)', () => {
  async function started(steering: boolean) {
    const rig = makeAcpRig();
    rig.scriptHang();
    rig.next = { ...rig.next, steering };
    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    return { rig, h };
  }

  it('uses _session/steering when the adapter advertises it, and echoes inbox_delivered', async () => {
    const { rig, h } = await started(true);
    await rig.driver.steer(h, 'change course', 'steer', 7);
    expect(rig.agents[0]?.paramsOf('_session/steering')[0]).toMatchObject({
      sessionId: 'sess-1',
      prompt: [{ type: 'text', text: 'change course' }],
      _meta: { steering: { idleBehavior: 'promptRequired' } },
    });
    await rig.driver.cancel(h);
    await rig.driver.result(h);
    expect((await events(rig)).find((e) => e.type === 'inbox_delivered')).toMatchObject({
      inbox_seq: 7,
      mode: 'steer',
    });
  });

  it('refuses steer with a typed error when the adapter does not advertise steering', async () => {
    const { rig, h } = await started(false);
    await expect(rig.driver.steer(h, 'x', 'steer')).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });
    expect(rig.agents[0]?.methods()).not.toContain('_session/steering');
    await rig.driver.cancel(h);
  });

  it('queues follow_up as the next prompt and runs it after the current turn', async () => {
    const { rig, h } = await started(true);
    await rig.driver.steer(h, 'then do this', 'follow_up');
    expect(rig.agents[0]?.paramsOf('session/prompt')).toHaveLength(1);
    await rig.driver.cancel(h);
    await rig.driver.result(h);
  });

  it('interrupt cancels the turn, then prompts with the message', async () => {
    const { rig, h } = await started(true);
    await rig.driver.steer(h, 'stop and do X', 'interrupt');
    expect((await rig.driver.result(h)).status).toBe('success');
    const m = rig.agents[0]?.methods() ?? [];
    expect(m.indexOf('session/cancel')).toBeLessThan(m.lastIndexOf('session/prompt'));
    expect(rig.agents[0]?.paramsOf('session/prompt')[1]).toMatchObject({
      prompt: [{ type: 'text', text: 'stop and do X' }],
    });
  });

  it('numbers deliveries itself when the sender gave no inbox sequence', async () => {
    const { rig, h } = await started(true);
    await rig.driver.steer(h, 'a', 'follow_up');
    await rig.driver.steer(h, 'b', 'follow_up');
    await rig.driver.cancel(h);
    await rig.driver.result(h);
    const delivered = (await events(rig)).filter((e) => e.type === 'inbox_delivered');
    expect(
      delivered.map((e) => (e.type === 'inbox_delivered' ? e.inbox_seq : -1)),
    ).toEqual([0, 1]);
  });
});

describe('ACP engine: cancel and process tree (rule 7)', () => {
  it('sends session/cancel, then ends the run as cancelled and kills the tree on Windows', async () => {
    const rig = makeAcpRig({}, undefined, 'win32');
    rig.scriptHang();
    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    await rig.driver.cancel(h);
    expect((await rig.driver.result(h)).status).toBe('cancelled');
    expect(rig.agents[0]?.methods()).toContain('session/cancel');
    const kill = rig.spawns.find((c) => c.command === 'taskkill');
    expect(kill?.args).toEqual(['/T', '/F', '/PID', '4242']);
  });

  it('kills the tree after the grace period when the adapter ignores the cancel', async () => {
    const rig = makeAcpRig({ cancelGraceMs: 2_000 });
    rig.next = {
      auth: 'account',
      onPrompt: async () => new Promise(() => undefined),
    };
    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    const cancelling = rig.driver.cancel(h);
    await waitFor(() => rig.clock.pending() > 0, 'grace timer');
    await rig.clock.advance(2_000);
    await cancelling;
    expect((await rig.driver.result(h)).status).toBe('cancelled');
    expect(rig.groupSignals).toEqual([{ pid: 4242, signal: 'SIGKILL' }]);
  });

  it('maps a child that dies mid-run to a crash', async () => {
    const rig = makeAcpRig();
    rig.next = { auth: 'account', onPrompt: async () => new Promise(() => undefined) };
    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    rig.agents[0]?.child.exit(1);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'error',
      errorFamily: 'crash',
    });
  });
});

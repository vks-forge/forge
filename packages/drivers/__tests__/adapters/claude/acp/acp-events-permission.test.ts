/**
 * Pins: ACP event normalisation and the permission handler.
 *
 * Why: normalised events are the only thing the Director and the replay log ever see, and
 * the permission handler is where a harness asks to run a tool. Permission is answered
 * from the hook's recorded decision and never decided twice (one door), so a tool is
 * allowed only when policy already allowed it.
 *
 * Depends on: helpers/claude-rigs, helpers/fake-acp-agent, helpers/acp-flow-utils.
 */

import { RunEvent } from '@forge/core';
import { canonicalJson, sha256Hex } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import type { PromptContext } from '#tests/helpers/fake-acp-agent.js';
import { waitFor } from '#tests/helpers/wait-for.js';
import { receiptAsked, bash, events, selected } from '#tests/helpers/acp-flow-utils.js';

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

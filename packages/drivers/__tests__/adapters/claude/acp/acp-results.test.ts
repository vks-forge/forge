/**
 * Pins: every row of the result table for the ACP engine.
 *
 * Why: the Director retries, backs off, escalates or stops by the result's status and error
 * family. Each row is a way a Worker can end (budget, turn cap, refusal, rate limit, no
 * login, stall, a question left open, a crash), and a wrong family sends the ticket down
 * the wrong path: a retry loop on a refusal, or a human page for a rate limit.
 *
 * Depends on: helpers/claude-rigs, helpers/fake-acp-agent.
 */

import { RequestError } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import type { FakeAcpOptions } from '#tests/helpers/fake-acp-agent.js';
import { waitFor } from '#tests/helpers/wait-for.js';

const promptSeen = (rig: ReturnType<typeof makeAcpRig>) => () =>
  rig.agents[0]?.methods().includes('session/prompt') ?? false;

async function finish(over: Partial<FakeAcpOptions>, config = {}) {
  const rig = makeAcpRig(config);
  rig.next = { auth: 'account', steering: true, ...over };
  const h = await rig.driver.start(rig.request());

  return { rig, h, result: await rig.driver.result(h) };
}

describe('ACP engine: result table', () => {
  it('end_turn is success with the session, so it can be resumed', async () => {
    const { result } = await finish({});
    expect(result).toMatchObject({ status: 'success', session: 'sess-1' });
    expect(result.errorFamily).toBeUndefined();
  });

  it('budget: a rejected prompt naming the budget is error/budget', async () => {
    const { result } = await finish({
      onPrompt: async () =>
        RequestError.internalError(undefined, 'Reached maximum budget ($0.05)'),
    });

    expect(result).toMatchObject({ status: 'error', errorFamily: 'budget' });
  });

  it('max_turns: stopReason max_turn_requests is status max_turns and drops the session', async () => {
    const { result } = await finish({
      onPrompt: async () => ({ stopReason: 'max_turn_requests' }),
    });

    expect(result).toMatchObject({ status: 'max_turns', session: null });
    expect(result.errorFamily).toBeUndefined();
  });

  it('max_turns: a rejection with the turns kind is also max_turns', async () => {
    const { result } = await finish({
      onPrompt: async () => RequestError.internalError(undefined, 'error_max_turns'),
    });

    expect(result.status).toBe('max_turns');
  });

  it('refusal: stopReason refusal is refused/refusal', async () => {
    const { result } = await finish({
      onPrompt: async () => ({ stopReason: 'refusal' }),
    });

    expect(result).toMatchObject({ status: 'refused', errorFamily: 'refusal' });
  });

  it('rate limit: the _claude/rateLimit reset time becomes retryNotBefore', async () => {
    const reset = Math.floor(Date.UTC(2026, 9, 13, 18, 0, 0) / 1000);
    const { result } = await finish({
      onPrompt: async (ctx) => {
        await ctx.rateLimit({
          status: 'rejected',
          resetsAt: reset,
          rateLimitType: 'five_hour',
        });

        return RequestError.internalError({ errorKind: 'rate_limit' }, 'rate limited');
      },
    });

    expect(result).toMatchObject({
      status: 'error',
      errorFamily: 'rate_limit',
      retryNotBefore: new Date(reset * 1000).toISOString(),
    });
  });

  it('rate limit: a 429 with no reset time backs off by the configured delay', async () => {
    const rig = makeAcpRig({ rateLimitBackoffMs: 120_000 });
    rig.next = {
      auth: 'account',
      onPrompt: async () =>
        RequestError.internalError(undefined, 'API Error: 429 overloaded'),
    };

    const result = await rig.driver.result(await rig.driver.start(rig.request()));
    expect(result.errorFamily).toBe('rate_limit');
    expect(result.retryNotBefore).toBe(new Date(rig.clock.now() + 120_000).toISOString());
  });

  it('auth: no account report is error/auth', async () => {
    const { result } = await finish({ auth: 'none' });
    expect(result).toMatchObject({ status: 'error', errorFamily: 'auth' });
  });

  it('stall: no event for stallMs cancels the run as timeout/stall', async () => {
    const rig = makeAcpRig();
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        await ctx.cancelled;

        return { stopReason: 'cancelled' };
      },
    };

    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    await rig.clock.advance(60_000);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'timeout',
      errorFamily: 'stall',
    });

    expect(rig.agents[0]?.methods()).toContain('session/cancel');
  });

  it('stall: any session/update, even an ignored one, counts as activity', async () => {
    const rig = makeAcpRig();
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        // 125s in total but never 60s without an update; the gap leaves slack for I/O hops.
        for (let i = 0; i < 5; i++) {
          await rig.clock.advance(25_000);
          await ctx.update({ sessionUpdate: 'plan', entries: [] });
        }

        return { stopReason: 'end_turn' };
      },
    };

    const h = await rig.driver.start(rig.request());
    expect((await rig.driver.result(h)).status).toBe('success');
  });

  it('turn timeout: a turn longer than turnMs is timeout/stall', async () => {
    const rig = makeAcpRig();
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        const beat = setInterval(() => {
          void ctx.update({ sessionUpdate: 'plan', entries: [] });
        }, 5);

        await ctx.cancelled;
        clearInterval(beat);

        return { stopReason: 'cancelled' };
      },
    };

    const req = rig.request({
      budget: { maxTurns: 5, maxUsd: 0.05, stallMs: 1_000_000, turnMs: 30_000 },
    });

    const h = await rig.driver.start(req);
    await waitFor(promptSeen(rig), 'prompt');
    await rig.clock.advance(30_000);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'timeout',
      errorFamily: 'stall',
    });
  });

  it('paused: ending right after ask_director names the open interaction', async () => {
    const { result, rig } = await finish({
      onPrompt: async (ctx) => {
        await ctx.update({
          sessionUpdate: 'tool_call',
          toolCallId: 'q1',
          name: 'mcp__forge__ask_director',
          title: 'ask_director',
          rawInput: { question: 'which db?' },
        });

        await ctx.update({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'q1',
          status: 'completed',
          rawOutput: JSON.stringify({ interaction_id: 'int-9', status: 'pending' }),
        });

        return { stopReason: 'end_turn' };
      },
    });

    expect(result).toMatchObject({
      status: 'paused',
      pauseReason: 'interaction',
      interactionId: 'int-9',
    });

    expect(rig).toBeDefined();
  });

  it('paused is cancelled out when the Worker kept working after the question', async () => {
    const { result } = await finish({
      onPrompt: async (ctx) => {
        await ctx.update({
          sessionUpdate: 'tool_call',
          toolCallId: 'q1',
          name: 'mcp__forge__ask_director',
          title: 'ask',
          rawInput: {},
        });

        await ctx.update({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'q1',
          status: 'completed',
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: '{"interaction_id":"int-9","status":"pending"}',
              },
            },
          ],
        });

        await ctx.update({
          sessionUpdate: 'tool_call',
          toolCallId: 'next',
          name: 'Read',
          title: 'read',
          rawInput: {},
        });

        return { stopReason: 'end_turn' };
      },
    });

    expect(result.status).toBe('success');
  });

  it('unexpected exit: a child that exits without a result is error/crash', async () => {
    const rig = makeAcpRig();
    rig.next = { auth: 'account', onPrompt: async () => new Promise(() => undefined) };
    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    rig.agents[0]?.child.exit(3);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'error',
      errorFamily: 'crash',
    });
  });

  it('an unrecognised failure is error/unknown, never success', async () => {
    const { result } = await finish({
      onPrompt: async () => RequestError.internalError(undefined, 'something odd'),
    });

    expect(result).toMatchObject({ status: 'error', errorFamily: 'unknown' });
  });

  it('files touched come from git, injected through the git port', async () => {
    const rig = makeAcpRig(
      {},
      { head: async () => 'b1', changedFiles: async () => ['x.ts', 'y.ts'] },
    );

    const result = await rig.driver.result(await rig.driver.start(rig.request()));
    expect(result.filesTouched).toEqual(['x.ts', 'y.ts']);
  });

  it('reports an empty file list instead of failing when git fails', async () => {
    const rig = makeAcpRig(
      {},
      {
        head: async () => 'b1',
        changedFiles: async () => {
          throw new Error('git exploded');
        },
      },
    );

    const result = await rig.driver.result(await rig.driver.start(rig.request()));
    expect(result).toMatchObject({ status: 'success', filesTouched: [] });
    expect(rig.logs.some((l) => l.level === 'warn' && l.message.includes('git'))).toBe(
      true,
    );
  });
});

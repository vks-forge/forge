/**
 * Pins: the ACP receipt cross-check.
 *
 * Why: every tool call must have a policy receipt written by the hook. A tool call with no
 * receipt means the hook was bypassed, so the run is killed as policy_denied; a receipted
 * call, including one whose receipt arrives inside the grace window, must pass untouched.
 *
 * Depends on: helpers/claude-rigs, helpers/fake-acp-agent, helpers/acp-flow-utils.
 */

import { canonicalJson, sha256Hex } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import type { PromptContext } from '#tests/helpers/fake-acp-agent.js';
import { waitFor } from '#tests/helpers/wait-for.js';
import { receiptAsked, bash, events } from '#tests/helpers/acp-flow-utils.js';

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

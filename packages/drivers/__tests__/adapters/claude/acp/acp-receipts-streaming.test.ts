/**
 * Pins: the ACP receipt cross-check waits for a streaming tool call's input.
 *
 * Why: the ACP adapter announces a tool call the moment the model starts writing it, with
 * an empty input; the PreToolUse hook (and so the receipt) only exists once the input is
 * complete. Live probe 8 killed a healthy Worker as policy_denied because its second Edit
 * was still being written when the 3 s grace ran out. A call that resolves without a
 * receipt must still be caught, or the cross-check would guard nothing.
 *
 * Depends on: helpers/claude-rigs, helpers/fake-acp-agent, helpers/acp-flow-utils.
 */

import { describe, expect, it } from 'vitest';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import { bash, promptSeen, receiptAsked } from '#tests/helpers/acp-flow-utils.js';
import { waitFor } from '#tests/helpers/wait-for.js';

const streaming = { toolCallId: 'edit-2', name: 'Edit', title: 'Edit', rawInput: {} };
const done = {
  sessionUpdate: 'tool_call_update' as const,
  toolCallId: 'edit-2',
  status: 'completed' as const,
  rawOutput: 'ok',
};

describe('ACP engine: receipt cross-check with a streaming tool input', () => {
  it('does not start the grace clock on an announcement with no input yet', async () => {
    const rig = makeAcpRig();
    rig.receipts.allowAll = false;
    let finishInput: () => void = () => undefined;
    const inputComplete = new Promise<void>((resolve) => (finishInput = resolve));
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        await ctx.update({ sessionUpdate: 'tool_call', ...streaming });
        await inputComplete;
        await ctx.update(done);

        return { stopReason: 'end_turn' };
      },
    };

    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt sent');
    await rig.clock.advance(20_000);
    expect(rig.agents[0]?.methods()).not.toContain('session/cancel');

    rig.receipts.record('edit-2', 'allow');
    finishInput();
    expect((await rig.driver.result(h)).status).toBe('success');
  });

  it('still cancels as policy_denied when the call resolves with no receipt', async () => {
    const rig = makeAcpRig();
    rig.receipts.allowAll = false;
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        await ctx.update({ sessionUpdate: 'tool_call', ...streaming });
        await ctx.update(done);
        await ctx.cancelled;

        return { stopReason: 'cancelled' as const };
      },
    };

    const h = await rig.driver.start(rig.request());
    await waitFor(receiptAsked(rig), 'receipt lookup');
    await rig.clock.advance(3_000);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'error',
      errorFamily: 'policy_denied',
    });
  });

  it('keeps the immediate check for a call announced with its input', async () => {
    const rig = makeAcpRig();
    rig.receipts.allowAll = false;
    rig.next = {
      auth: 'account',
      onPrompt: async (ctx) => {
        await ctx.update({ sessionUpdate: 'tool_call', ...bash('ghost') });
        await ctx.cancelled;

        return { stopReason: 'cancelled' as const };
      },
    };

    const h = await rig.driver.start(rig.request());
    await waitFor(receiptAsked(rig), 'receipt lookup');
    await rig.clock.advance(3_000);
    expect((await rig.driver.result(h)).errorFamily).toBe('policy_denied');
  });
});

/**
 * Pins: a tool call Claude Code rejected before its hook ran is not a receipt bypass.
 *
 * Why: Claude Code validates a call (for example an Edit whose old string matches three
 * places) before PreToolUse runs, so a rejected call never gets a decision receipt. Live
 * run-ab0dd22cea144ac78d30 (DCP-6) was failed as policy_denied for exactly that, though the
 * tool never executed, and its card stuck in progress. A call that did run (a successful
 * result) or an error with no validation marker must still need its receipt, or the
 * cross-check would guard nothing.
 *
 * Depends on: helpers/claude-rigs, helpers/acp-flow-utils.
 */

import { describe, expect, it } from 'vitest';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import { bash, receiptAsked } from '#tests/helpers/acp-flow-utils.js';
import { waitFor } from '#tests/helpers/wait-for.js';

const validation = {
  sessionUpdate: 'tool_call_update' as const,
  toolCallId: 'edit-9',
  status: 'failed' as const,
  rawOutput:
    '<tool_use_error>Found 3 matches of the string to replace, but replace_all is false.</tool_use_error>',
};

/** The agent sends `updates`, then either waits to be cancelled or waits for `release()`. */
function rigWith(updates: readonly object[], mode: 'cancelled' | 'released') {
  const rig = makeAcpRig();
  rig.receipts.allowAll = false;
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  rig.next = {
    auth: 'account',
    onPrompt: async (ctx) => {
      for (const u of updates) {
        await ctx.update(u as never);
      }

      await (mode === 'cancelled' ? ctx.cancelled : released);

      return {
        stopReason: mode === 'cancelled' ? ('cancelled' as const) : ('end_turn' as const),
      };
    },
  };

  return { rig, release };
}

describe('ACP engine: receipt cross-check and harness-rejected calls', () => {
  it('lets a call announced empty and rejected by validation pass without a receipt', async () => {
    const { rig, release } = rigWith(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'edit-9',
          name: 'Edit',
          title: 'Edit',
          rawInput: {},
        },
        validation,
      ],
      'released',
    );

    const h = await rig.driver.start(rig.request());
    await waitFor(
      () => rig.agents[0]?.methods().includes('session/prompt') ?? false,
      'prompt sent',
    );

    await rig.clock.advance(5_000);
    release();

    expect((await rig.driver.result(h)).status).toBe('success');
  });

  it('lets a call announced with its input and rejected by validation pass without a receipt', async () => {
    const { rig, release } = rigWith(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'edit-9',
          name: 'Edit',
          title: 'Edit',
          rawInput: { file_path: '/w/a.ts', old_string: 'x', new_string: 'y' },
        },
        validation,
      ],
      'released',
    );

    const h = await rig.driver.start(rig.request());
    await waitFor(receiptAsked(rig), 'receipt lookup');
    await rig.clock.advance(5_000);
    release();

    expect((await rig.driver.result(h)).status).toBe('success');
  });

  it('still needs a receipt when the call succeeded', async () => {
    const { rig } = rigWith(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'edit-9',
          name: 'Edit',
          title: 'Edit',
          rawInput: {},
        },
        { ...validation, status: 'completed', rawOutput: 'ok' },
      ],
      'cancelled',
    );

    const h = await rig.driver.start(rig.request());
    await waitFor(receiptAsked(rig), 'receipt lookup');
    await rig.clock.advance(5_000);

    expect(await rig.driver.result(h)).toMatchObject({
      status: 'error',
      errorFamily: 'policy_denied',
    });
  });

  it('still needs a receipt when an error carries no validation marker', async () => {
    const { rig } = rigWith(
      [
        { sessionUpdate: 'tool_call', ...bash('edit-9', 'rm -rf /') },
        { ...validation, rawOutput: 'command exited 1' },
      ],
      'cancelled',
    );

    const h = await rig.driver.start(rig.request());
    await waitFor(receiptAsked(rig), 'receipt lookup');
    await rig.clock.advance(5_000);

    expect((await rig.driver.result(h)).errorFamily).toBe('policy_denied');
  });
});

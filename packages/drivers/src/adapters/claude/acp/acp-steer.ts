/**
 * Mid-run message delivery for one ACP run.
 *
 * Why: the Director talks to a running Worker in three ways: a `follow_up` that waits for
 *   the current turn, an `interrupt` that cancels it and speaks next, and a live `steer`
 *   injected into the running turn. Live steering only exists when the adapter advertises
 *   it and config allows it; claiming it otherwise would silently drop the message. If
 *   the adapter reports the run is idle (`promptRequired`) the text becomes the next
 *   prompt, so no message is ever lost between turns.
 *
 * Exports: deliverSteer().
 * Depends on: @forge/core (InvalidInputError, SteerMode), types/claude/acp,
 *   types/claude/engine. IO: ACP requests.
 */

import { InvalidInputError } from '@forge/core';
import type { SteerMode } from '@forge/core';
import type { AcpAgent, AcpRunState } from '#/types/claude/acp.types.js';
import type { EngineDeps } from '#/types/claude/engine.types.js';

/** Delivers `text` to the live session by `mode`; throws `InvalidInputError` when unsupported. */
export async function deliverSteer(
  ctx: AcpAgent,
  config: EngineDeps['config'],
  state: AcpRunState,
  queue: string[],
  text: string,
  mode: SteerMode,
): Promise<void> {
  if (mode === 'steer' && !(config.acpSteering && state.steering)) {
    throw new InvalidInputError('this adapter does not support live steering');
  }

  const sessionId = state.sessionId ?? '';
  if (mode === 'follow_up') {
    queue.push(text);
  } else if (mode === 'interrupt') {
    state.interrupting = true;
    queue.unshift(text);
    await ctx.notify('session/cancel', { sessionId });
  } else {
    const out = await ctx.request<{ outcome?: string }>('_session/steering', {
      sessionId,
      prompt: [{ type: 'text', text }],
      _meta: { steering: { idleBehavior: 'promptRequired' } },
    });

    // Between turns there is nothing to inject into; the host owns the continuation.
    if (out.outcome === 'promptRequired') {
      queue.push(text);
    }
  }
}

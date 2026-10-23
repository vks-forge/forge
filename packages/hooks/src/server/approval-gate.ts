/**
 * Approval gate of the hook handler: what an `ask` verdict becomes.
 *
 * Why: on Standard and Full a call policy marks `ask` must stop visibly, not run and not be
 *   silently dropped: the owner is asked and the Worker is told to wait. The handler cannot
 *   import the engine (hooks sit beside it, not above), so the server injects `raiseApproval`;
 *   this module only decides what to do with its answer. A raise that fails or is refused turns the
 *   ask into `deny` with `approval_unavailable`, because an ask that nobody was told about
 *   would be a call that waits for ever. It also names who answered an allow: a call that rode
 *   on the owner's answer is receipted `approver: 'user'` with the answer as the reference
 *   (tool-system.md §5.4, §10, d-0175).
 *
 * Exports: resolveAsk(), approverOf().
 * Depends on: @forge/core (Run), @forge/tools (Decision), types/{approval-gate,hook-handler}. No IO of its own.
 */

import type { Run } from '@forge/core';
import type { Decision } from '@forge/tools';
import type { JudgedCall, ResolvedAsk } from '#/types/approval-gate.types.js';
import type { HookHandlerDeps } from '#/types/hook-handler.types.js';

/**
 * Raises the owner's approval for an `ask` and returns the verdict to answer with. Anything
 * other than an `ask`, or a handler wired without `raiseApproval`, is returned unchanged.
 */
export async function resolveAsk(
  deps: Pick<HookHandlerDeps, 'raiseApproval'>,
  run: Run,
  used: JudgedCall,
  decision: Decision,
  useId: string | undefined,
): Promise<ResolvedAsk> {
  if (decision.decision !== 'ask' || deps.raiseApproval === undefined) {
    return { decision };
  }

  const raised = await deps
    .raiseApproval({ run, ctx: used.ctx, call: used.call, decision, useId })
    .catch(() => null);

  if (raised === null) {
    return {
      decision: { ...decision, decision: 'deny', reason: 'approval_unavailable' },
    };
  }

  return {
    decision: { ...decision, reason: 'awaiting_owner' },
    interactionId: raised.interaction_id,
  };
}

/** Who answered: the owner for an allow made by an approval, otherwise policy alone. */
export function approverOf(decision: Decision): 'auto' | 'user' {
  return decision.layer === 'approval' && decision.decision === 'allow' ? 'user' : 'auto';
}

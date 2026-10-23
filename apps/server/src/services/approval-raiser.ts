/**
 * Turns an `ask` from the hook handler into the engine's tool-approval request.
 *
 * Why: the hook handler may not import the engine, and the engine may not import policy, so
 *   the server joins them. It computes, from the call policy judged, the facts the owner
 *   decides on: the exact command, URL or path (from the tokenised call, never the Worker's
 *   prose), the approval key the answer will ride on, which rule asked, and whether "Always for
 *   this project" can be offered and as which rule. A call that has no key (it cannot be named
 *   safely) cannot be approved, so it is not raised and the hook denies it. The Worker's own
 *   `description` is passed along only as the clipped "why" (d-0175, tool-system.md §5.4).
 *
 * Exports: createApprovalRaiser().
 * Depends on: @forge/engine (ToolApprovalRequest, ToolApprovalResult types), @forge/hooks (RaiseApproval type),
 *   @forge/tools (alwaysRuleFor, approvalKey, approvalWhat, toolAction). No IO of its own.
 */

import type { ToolApprovalRequest, ToolApprovalResult } from '@forge/engine';
import type { RaiseApproval } from '@forge/hooks';
import { alwaysRuleFor, approvalKey, approvalWhat, toolAction } from '@forge/tools';

/** The hook handler's `raiseApproval`, over the engine's `raiseToolApproval` door. */
export function createApprovalRaiser(
  raise: (request: ToolApprovalRequest) => Promise<ToolApprovalResult>,
): RaiseApproval {
  return async ({ run, ctx, call, decision, useId }) => {
    const key = approvalKey(ctx, call);
    if (key === null) {
      return null;
    }

    const offer = alwaysRuleFor(ctx, call, decision);
    const result = await raise({
      runId: run.id,
      tool: call.tool,
      action: toolAction(call.tool),
      what: approvalWhat(ctx, call),
      approvalKey: key,
      reasonCode: decision.reason,
      always: offer.offered
        ? { offered: true, rule: offer.rule }
        : { offered: false, why: offer.why },
      ...(useId === undefined ? {} : { callId: useId }),
      description: call.input?.['description'],
    });

    return result.status === 'raised' ? { interaction_id: result.interactionId } : null;
  };
}

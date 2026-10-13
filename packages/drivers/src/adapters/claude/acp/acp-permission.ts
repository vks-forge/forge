/**
 * Answers `session/request_permission` from the decision the hook already recorded.
 *
 * Why: policy has one door. The PreToolUse hook sends every tool call to the server's
 *   `admit()` and records the verdict as a signed receipt; if this handler called `admit()`
 *   again it would be a second, possibly different, decision for the same call. It only
 *   reads the receipt: a recorded `allow` is answered `allow_once`, anything else (deny,
 *   ask, or no receipt after the grace window) is `reject_once`, and a missing receipt is
 *   also reported as a `policy_denied` error because it means the hook did not run. If the
 *   adapter offered no option of the kind we want, the request is cancelled rather than
 *   answered with a guess, so the failure is closed (code.md rule 6).
 *
 * Exports: answerPermission().
 * Depends on: @agentclientprotocol/sdk (types), schemas/claude-acp, types/claude/engine.
 *   No IO (reads receipts through the sink).
 */

import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import { readClaudeToolName } from '#/schemas/claude-acp.js';
import type { EngineSink } from '#/types/claude/engine.types.js';

export async function answerPermission(
  sink: EngineSink,
  params: RequestPermissionRequest,
): Promise<RequestPermissionResponse> {
  const tc = params.toolCall;
  const call = {
    id: tc.toolCallId,
    name: tc.name || readClaudeToolName(tc._meta) || tc.title || 'unknown',
    input: tc.rawInput ?? {},
  };

  const decision = await sink.decisionFor(call);
  const allow = decision?.decision === 'allow';
  sink.emit({
    type: 'permission',
    call_id: call.id,
    tool: decision?.tool || call.name,
    decision: decision?.decision ?? 'deny',
  });

  if (!decision) {
    sink.emit({
      type: 'error',
      family: 'policy_denied',
      message: `no decision receipt for tool call ${call.id} (${call.name}); rejected`,
    });
  }

  const option = params.options.find(
    (o) => o.kind === (allow ? 'allow_once' : 'reject_once'),
  );

  return option
    ? { outcome: { outcome: 'selected', optionId: option.optionId } }
    : { outcome: { outcome: 'cancelled' } };
}

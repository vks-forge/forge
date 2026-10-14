/**
 * The driver's read view of the receipt chain.
 *
 * Why: the Claude driver never decides a tool call; the hook route did, and signed a
 *   receipt. The driver's permission handler and its receipt cross-check only need to read
 *   that verdict back. Joining is by the harness tool-use id (d-0057: the hook's
 *   `tool_use_id` equals the ACP `toolCallId`), with the args-hash join as the fallback the
 *   driver asks for when ids differ. A receipt that cannot be read as a valid decision is
 *   reported as `deny`, so a corrupt row can never turn into an allow.
 *
 * Exports: createReceiptLookup().
 * Depends on: @forge/tools (Decision, ReceiptLog, DecisionReceipt), types/claude/driver-deps.
 *   IO: reads the receipt log.
 */

import { Decision } from '@forge/tools';
import type { DecisionReceipt, ReceiptLog } from '@forge/tools';
import type { ReceiptLookup } from '#/types/claude/driver-deps.types.js';

function toDecision(r: DecisionReceipt): Decision {
  const parsed = Decision.safeParse({
    decision: r.decision,
    reason: r.reason,
    enforced_by: 'forge_admit',
    enforcement: r.enforced_by,
    layer: r.layer,
    matched_rule: r.rule_id,
    finding_ids: r.finding_ids,
    tool: r.tool,
  });

  if (parsed.success) {
    return parsed.data;
  }

  return {
    decision: 'deny',
    reason: 'fail_closed_internal',
    enforced_by: 'forge_admit',
    enforcement: r.enforced_by,
    layer: 'hook',
    matched_rule: null,
    finding_ids: [],
    tool: r.tool,
  };
}

/** Reads decisions from `receipts` by tool-use id, else by args hash. */
export function createReceiptLookup(receipts: ReceiptLog): ReceiptLookup {
  return {
    async decisionFor(runId, toolUseId, match) {
      const decisions = (await receipts.list(runId)).filter(
        (r): r is DecisionReceipt => r.kind === 'decision',
      );

      const found =
        decisions.find((d) => d.id === toolUseId) ??
        (match ? decisions.find((d) => d.args_hash === match.argsHash) : undefined);

      return found ? toDecision(found) : null;
    },
  };
}

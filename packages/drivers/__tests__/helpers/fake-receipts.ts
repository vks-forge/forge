/**
 * Fake server-side receipt chain for driver tests.
 *
 * Why: the driver never decides a tool call; it reads the verdict the hook already
 *   recorded. Tests therefore need a receipt view they can fill and empty: "the hook
 *   allowed tool call t1", "nothing was recorded for t2", and "the hook saw the call under
 *   a different id" (join by name and args hash).
 *
 * Exports: FakeReceipts, createFakeReceipts(), decisionOf().
 * Depends on: @forge/tools (Decision type), src/types/claude/driver-deps. No IO.
 */

import type { Decision } from '@forge/tools';
import type { ReceiptLookup, ToolCallMatch } from '#/types/claude/driver-deps.types.js';

export function decisionOf(verdict: Decision['decision'], tool = 'shell'): Decision {
  return {
    decision: verdict,
    reason: verdict === 'allow' ? 'rule_allow' : 'rule_deny',
    enforced_by: 'forge_admit',
    enforcement: 'hook',
    layer: 'rule',
    matched_rule: null,
    finding_ids: [],
    tool,
  };
}

export interface FakeReceipts extends ReceiptLookup {
  /** Records a decision under the harness tool-use id. */
  record(toolUseId: string, verdict: Decision['decision'], tool?: string): void;
  /** Records a decision under a different id; found only through the (name, args hash) join. */
  recordByMatch(match: ToolCallMatch, verdict: Decision['decision']): void;
  /** When true, `decisionFor` allows every id (a hook that approves everything). */
  allowAll: boolean;
  readonly asked: { runId: string; id: string; match?: ToolCallMatch | undefined }[];
}

export function createFakeReceipts(): FakeReceipts {
  const byId = new Map<string, Decision>();
  const byMatch = new Map<string, Decision>();
  const key = (m: ToolCallMatch): string => `${m.name}\0${m.argsHash}`;
  const fake: FakeReceipts = {
    allowAll: false,
    asked: [],
    record(id, verdict, tool) {
      byId.set(id, decisionOf(verdict, tool));
    },
    recordByMatch(match, verdict) {
      byMatch.set(key(match), decisionOf(verdict));
    },
    async decisionFor(runId, id, match) {
      fake.asked.push({ runId, id, match });
      const found = byId.get(id) ?? (match ? byMatch.get(key(match)) : undefined);
      if (found) {
        return found;
      }

      return fake.allowAll ? decisionOf('allow') : null;
    },
  };

  return fake;
}

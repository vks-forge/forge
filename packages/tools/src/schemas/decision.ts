/**
 * Decision schema — the single answer `admit()` returns for every tool call or listing.
 *
 * Why: the Worker, the receipt writer, the Ticket screen and the approval flow all act on
 *   the same verdict, so it must say not just allow/deny/ask but why, which rule decided
 *   it, and who enforced it. A closed reason set lets the model be told "what did not
 *   happen" without leaking policy detail, and lets the UI group denials; `enforced_by`
 *   and `enforcement` keep coverage honest when a harness cannot truly stop a call
 *   (tool-system.md §5.4, §7, §10).
 *
 * Exports: DecisionVerdict, ReasonCode, DecisionLayer, Decision.
 * Depends on: schemas/tool-definition, zod. No IO.
 */

import { z } from 'zod';
import { Enforcement } from '#/schemas/tool-definition.js';

export const DecisionVerdict = z.enum(['allow', 'deny', 'ask']);
export type DecisionVerdict = z.infer<typeof DecisionVerdict>;

export const ReasonCode = z.enum([
  'allowed',
  'rule_allow',
  'rule_ask',
  'rule_deny',
  'no_matching_rule',
  'managed_deny',
  'not_granted',
  'unknown_tool',
  'quarantined',
  'schema_changed',
  'schema_pending',
  'schema_denied',
  'unsupported_harness',
  'enforcement_insufficient',
  'exposure',
  'not_reachable',
  'untokenizable',
  'invalid_resource',
  'dynamic_execution',
  'risky_shell_construct',
  'inspector_error',
  'inspector_raised',
  'budget_exceeded',
  'budget_soft_limit',
  'unattended',
  'fail_closed_unknown_run',
  'fail_closed_no_credentials',
  'fail_closed_bad_token',
  'fail_closed_stale_generation',
  'fail_closed_bad_request',
  'fail_closed_inactive_run',
  'fail_closed_no_liveness',
  'fail_closed_internal',
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

export const DecisionLayer = z.enum([
  'floor',
  'capability',
  'rule',
  'inspector',
  'approval',
  'hook',
]);
export type DecisionLayer = z.infer<typeof DecisionLayer>;

export const Decision = z.object({
  decision: DecisionVerdict,
  reason: ReasonCode,
  enforced_by: z.literal('forge_admit'),
  /** Coverage honesty: who stops the call on this harness; `null` when no tool was resolved. */
  enforcement: Enforcement.nullable(),
  layer: DecisionLayer,
  /** Rule id (`lane:standard#4`, `managed#2`, `grant:deny:<glob>`) or `null` when no rule decided. */
  matched_rule: z.string().nullable(),
  finding_ids: z.array(z.string()),
  tool: z.string(),
});
export type Decision = z.infer<typeof Decision>;

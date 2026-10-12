/**
 * Types for call-time rule evaluation results.
 *
 * Why: the rule engine answers "what happens to this call and which rule said so". The
 *   admission function turns that into a Decision and receipts record the rule id, so the
 *   outcome must carry its provenance and a closed reason, not just allow/ask/deny
 *   (tool-system.md §5.2, §10).
 *
 * Exports: RuleOutcome, MatchMode.
 * Depends on: schemas/grant, schemas/decision. No IO.
 */

import type { ReasonCode } from '#/schemas/decision.js';
import type { Effect } from '#/schemas/grant.js';

export interface RuleOutcome {
  readonly effect: Effect;
  readonly reason: ReasonCode;
  /** `lane:standard#4`, `project#0`, `managed#2`, or `null` when no rule decided. */
  readonly rule: string | null;
}

/** How a rule resource is compared: file glob, plain wildcard (URLs, ids), or shell command prefix. */
export type MatchMode = 'path' | 'plain' | 'shell';

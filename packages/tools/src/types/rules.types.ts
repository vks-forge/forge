/**
 * Types for call-time rule evaluation results.
 *
 * Why: the rule engine answers "what happens to this call and which rule said so". The
 *   admission function turns that into a Decision and receipts record the rule id, so the
 *   outcome must carry its provenance and a closed reason, not just allow/ask/deny
 *   (tool-system.md §5.2, §10).
 *
 * Exports: RuleOutcome, MatchMode, SegmentShape.
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

/**
 * What surrounds the shell segment being judged: whether it stands alone (no assignment,
 * redirect, pipe, background or expansion) and the directory it runs in. A `strict` rule
 * matches only a clean segment run from its own `cwd`; without a shape it never matches.
 */
export interface SegmentShape {
  readonly clean: boolean;
  readonly cwd: string | undefined;
}

/** How a rule resource is compared: file glob, plain wildcard (URLs, ids), or shell command prefix. */
export type MatchMode = 'path' | 'plain' | 'shell';

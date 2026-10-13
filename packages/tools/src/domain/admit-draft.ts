/**
 * Decision drafts for admit(): construction, severity ordering and tightening.
 *
 * Why: admit() runs many independent checks (grant, rules, inspectors, budgets) and the
 *   answer must only ever get stricter as they report. One severity order and one
 *   `raise()` make that monotonic rule impossible to get wrong at a call site, and one
 *   `deny()` builder keeps every refusal in the same shape for receipts.
 *
 * Exports: SEVERITY, deny(), raise(), outcomeDraft().
 * Depends on: schemas/decision, schemas/grant, types/admit. No IO.
 */

import type { DecisionLayer, ReasonCode } from '#/schemas/decision.js';
import type { Effect } from '#/schemas/grant.js';
import type { AdmitDraft as Draft } from '#/types/admit.types.js';

export const SEVERITY: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };

export const deny = (
  reason: ReasonCode,
  layer: DecisionLayer,
  rule: string | null = null,
): Draft => ({
  decision: 'deny',
  reason,
  layer,
  rule,
  findings: [],
});

/** Raises `cur` to `next` only if `next` is stricter; findings accumulate. */
export function raise(cur: Draft, next: Draft): Draft {
  return SEVERITY[next.decision] > SEVERITY[cur.decision]
    ? { ...next, findings: [...cur.findings, ...next.findings] }
    : cur;
}

export function outcomeDraft(o: {
  effect: Effect;
  reason: ReasonCode;
  rule: string | null;
}): Draft {
  return {
    decision: o.effect,
    reason: o.reason,
    layer: o.reason === 'managed_deny' ? 'floor' : 'rule',
    rule: o.rule,
    findings: [],
  };
}

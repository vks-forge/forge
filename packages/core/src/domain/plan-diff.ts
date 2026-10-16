/**
 * Plan diff — what a revision changed against the version before it.
 *
 * Why: Request changes sends the Director back to a plan the owner already read, and the
 *   owner needs to see at a glance what moved instead of re-reading the whole plan (d-0132).
 *   The diff is computed by code over the two stored versions, never written by the model,
 *   so it is complete and cannot flatter the revision. Scalar and list fields are reported
 *   whole; tickets are reported per key (`tickets.t2`, with `null` for added or removed), plus
 *   `tickets.order` when the surviving tickets run in a different order.
 *
 * Exports: diffPlans().
 * Depends on: schemas/plan, shared/stable-json. No IO.
 */

import type { PlanDiffEntry, PlanVersion } from '#/schemas/plan.js';
import { stableJson } from '#/shared/stable-json.js';

const FIELDS = [
  'goal',
  'scope',
  'non_goals',
  'decisions',
  'assumptions',
  'verification',
  'card_links',
  'enhance_report',
] as const;

/** Entries for every field of `next` that differs from `prev`, in a fixed order. */
export function diffPlans(prev: PlanVersion, next: PlanVersion): PlanDiffEntry[] {
  const out: PlanDiffEntry[] = [];
  for (const field of FIELDS) {
    if (stableJson(prev[field]) !== stableJson(next[field])) {
      out.push({ field, before: prev[field], after: next[field] });
    }
  }

  const before = new Map(prev.tickets.map((t) => [t.key, t]));
  const after = new Map(next.tickets.map((t) => [t.key, t]));
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key) ?? null;
    const b = after.get(key) ?? null;
    if (stableJson(a) !== stableJson(b)) {
      out.push({ field: `tickets.${key}`, before: a, after: b });
    }
  }

  const kept = prev.tickets.map((t) => t.key).filter((k) => after.has(k));
  const keptNow = next.tickets.map((t) => t.key).filter((k) => before.has(k));
  if (stableJson(kept) !== stableJson(keptNow)) {
    out.push({ field: 'tickets.order', before: kept, after: keptNow });
  }

  return out;
}

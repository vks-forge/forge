/**
 * Receipt lookups shared by the claim and coverage checks.
 *
 * Why: a claim and a changed file are both judged by the same question, "did policy allow a
 *   call of this tool on this path and did its effect complete?". Keeping the answer in one
 *   place stops the claim matcher and the coverage check drifting apart on path folding or on
 *   which effect states count.
 *
 * Exports: allowedCalls(), touchedPath().
 * Depends on: @forge/tools (Receipt), shared/paths, types/check.types. No IO.
 */

import type { Receipt } from '@forge/tools';
import { foldPath } from '#/shared/paths.js';
import type { AllowedCall as Allowed } from '#/types/check.types.js';

/** Allowed decision receipts, each paired with the state of its effect receipt if any. */
export function allowedCalls(receipts: readonly Receipt[]): Allowed[] {
  const states = new Map<string, string>();
  for (const r of receipts) {
    if (r.kind === 'effect') {
      states.set(r.decision_id, r.state);
    }
  }

  const out: Allowed[] = [];
  for (const r of receipts) {
    if (r.kind === 'decision' && r.decision === 'allow') {
      out.push({ decision: r, state: states.get(r.id) });
    }
  }

  return out;
}

/** True when an allowed call of one of `tools` reached one of `state` on `path` (paths folded). */
export function touchedPath(
  calls: readonly Allowed[],
  tools: ReadonlySet<string>,
  state: ReadonlySet<string>,
  path: string,
  worktreePath: string,
): boolean {
  const wanted = foldPath(path, worktreePath);

  return calls.some(
    (c) =>
      tools.has(c.decision.tool) &&
      c.state !== undefined &&
      state.has(c.state) &&
      c.decision.resource !== null &&
      foldPath(c.decision.resource, worktreePath) === wanted,
  );
}

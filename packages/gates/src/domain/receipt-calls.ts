/**
 * Receipt lookups shared by the claim and coverage checks.
 *
 * Why: a claim and a changed file are both judged by the same question, "did policy allow a
 *   call of this tool on this path and did its effect complete?". Keeping the answer in one
 *   place stops the claim matcher and the coverage check drifting apart on path folding or on
 *   which effect states count.
 *
 * Exports: allowedCalls(), touchedPath(), readBacking().
 * Depends on: @forge/tools (Receipt), shared/paths, types/check.types. No IO.
 */

import type { Receipt } from '@forge/tools';
import { containsPath, foldPath } from '#/shared/paths.js';
import type { AllowedCall as Allowed, ReadBacking } from '#/types/check.types.js';

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

/**
 * The evidence for reading `path`: an allowed call whose effect is `read_completed` on the
 * path itself or on a folder containing it. The effect state, not the tool name, is the
 * test: only a tool of risk `read` ends `read_completed`, so `Read`, `Grep`, `Glob` or any
 * other catalogue read tool counts, in any harness. An exact match wins over a folder.
 */
export function readBacking(
  calls: readonly Allowed[],
  path: string,
  worktreePath: string,
): ReadBacking | null {
  const wanted = foldPath(path, worktreePath);
  const root = foldPath(worktreePath);
  let folder: string | undefined;

  for (const c of calls) {
    if (c.state !== 'read_completed' || c.decision.resource === null) {
      continue;
    }

    const got = foldPath(c.decision.resource, worktreePath);
    if (got === wanted) {
      return { folder: null };
    }

    if (folder === undefined && containsPath(c.decision.resource, path, worktreePath)) {
      folder = got === '' || got === root ? '.' : got;
    }
  }

  return folder === undefined ? null : { folder };
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

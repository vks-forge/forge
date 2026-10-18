/**
 * Rejected-approach check — the engine's own look at a plan against every rejected approach of the project.
 *
 * Why: the verify step names the rejected approaches a plan repeats (`rejected_hits`), but it can only name
 *   what it was shown, and the model may skim. A rejected approach that a search left out of the prompt must
 *   still stop a plan that repeats it (d-0141 item 6), so the engine reads the full list from the memory
 *   index (never the top-k) and checks the plan's own words against each record: a record counts as repeated
 *   when most of its distinctive words appear in the plan's goal, scope and tickets. The plan's non-goals are
 *   left out on purpose, because saying "we will not do X" is the opposite of repeating X. A hit only adds a
 *   reason for the owner to look; it never blocks anything by itself.
 *
 * Exports: planRejectedHits().
 * Depends on: @forge/core (directorScope, extractTerms), types/card-planning.
 */

import { directorScope, extractTerms, termFrequencies } from '@forge/core';
import type { WritePlanOutput } from '@forge/core';
import type { PlanCtx } from '#/types/card-planning.types.js';

const TEXT_MAX = 20_000;
const MIN_SHARED = 2;
const SHARE = 0.6;

/** Ids of the project's rejected approaches that the plan appears to repeat; none without a memory index. */
export async function planRejectedHits(
  pc: PlanCtx,
  plan: Pick<WritePlanOutput, 'goal' | 'scope' | 'tickets'>,
): Promise<string[]> {
  const index = pc.ctx.deps.memoryIndex;
  if (!index) {
    return [];
  }

  const rejected = await index.rejected(pc.project.slug, undefined, directorScope());
  const text = [plan.goal, ...plan.scope, JSON.stringify(plan.tickets)].join('\n');
  const words = new Set(termFrequencies(text.slice(0, TEXT_MAX)).keys());

  return rejected
    .filter((r) => {
      const terms = extractTerms(r.statement);
      const shared = terms.filter((t) => words.has(t)).length;

      return (
        terms.length >= MIN_SHARED &&
        shared >= Math.max(MIN_SHARED, Math.ceil(terms.length * SHARE))
      );
    })
    .map((r) => r.id);
}

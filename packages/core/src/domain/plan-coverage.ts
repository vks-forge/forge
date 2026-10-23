/**
 * Plan coverage: which tickets a plan would cancel without saying what happens to their work.
 *
 * Why: a re-plan cancels the earlier tickets that had not started. If the new plan neither
 *   plans their files, nor shares their title or key, nor names them as dropped, their work
 *   silently disappears. The owner sees this list at approval and the Director may not approve
 *   on its own while it is non-empty.
 *
 * Exports: uncoveredTickets().
 * Depends on: schemas/plan, types/plan-coverage. No IO.
 */

import type { PlanVersion } from '#/schemas/plan.js';
import type { CancelledTicketFacts } from '#/types/plan-coverage.types.js';

const normPath = (p: string): string => p.replaceAll('\\', '/').replace(/^\.\//, '');
const normText = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether `text` mentions `token` as a whole word (ids and keys contain `-`, so it counts as part of a word). */
function mentions(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i').test(text);
}

/** The cancelled tickets the plan does not cover, in input order. */
export function uncoveredTickets(
  cancelled: readonly CancelledTicketFacts[],
  plan: Pick<PlanVersion, 'tickets' | 'non_goals' | 'assumptions'>,
): CancelledTicketFacts[] {
  const files = new Set(plan.tickets.flatMap((t) => t.files.map(normPath)));
  const titles = new Set(plan.tickets.map((t) => normText(t.title)));
  const keys = new Set(plan.tickets.map((t) => t.key));
  const notes = [...plan.non_goals, ...plan.assumptions];

  return cancelled.filter((c) => {
    const byFile = c.files.some((f) => files.has(normPath(f)));
    const byName =
      titles.has(normText(c.title)) || (c.planKey !== undefined && keys.has(c.planKey));

    const byNote = notes.some(
      (n) => mentions(n, c.id) || (c.planKey !== undefined && mentions(n, c.planKey)),
    );

    return !(byFile || byName || byNote);
  });
}

/**
 * Overview lists — how the projects table is ordered and which waiting items surface.
 *
 * Why: the owner opens the Overview to see what needs them first. Projects with the most work
 *   waiting come first (then the most recently active, then by name so the order never flips
 *   between refreshes), and the Needs attention list shows only the newest few items across
 *   projects so a long backlog cannot bury a fresh question. Kept apart from the sums so each
 *   rule can be read and tested on its own.
 *
 * Exports: byWaitingThenActivity(), attentionOf(), ATTENTION_LIMIT.
 * Depends on: schemas/overview-stats, types/overview-stats-input.types. No IO.
 */

import type { OverviewAttention, OverviewStats } from '#/schemas/overview-stats.js';
import type { OverviewProjectInput } from '#/types/overview-stats-input.types.js';

/** How many needs-action items the Overview lists. */
export const ATTENTION_LIMIT = 10;

/** Most waiting first, then most recent activity, then slug. */
export function byWaitingThenActivity(
  a: OverviewStats['projects'][number],
  b: OverviewStats['projects'][number],
): number {
  const lastA = a.last_activity ?? '';
  const lastB = b.last_activity ?? '';

  if (a.waiting_on_you !== b.waiting_on_you) {
    return b.waiting_on_you - a.waiting_on_you;
  }

  if (lastA !== lastB) {
    return lastA < lastB ? 1 : -1;
  }

  return a.slug < b.slug ? -1 : 1;
}

export function attentionOf(
  projects: readonly OverviewProjectInput[],
): OverviewAttention[] {
  return projects
    .flatMap((p) => p.needsAction)
    .sort(
      (a, b) =>
        (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0) ||
        (a.id < b.id ? -1 : 1),
    )
    .slice(0, ATTENTION_LIMIT)
    .map((i) => ({
      id: i.id,
      kind: i.kind,
      project: i.project,
      title: i.title,
      ...(i.ticket_id ? { ticket_id: i.ticket_id } : {}),
      ...(i.run_id ? { run_id: i.run_id } : {}),
      updated_at: i.updated_at,
    }));
}

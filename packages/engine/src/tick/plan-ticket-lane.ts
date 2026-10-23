/**
 * Plan ticket lane: the lane a planned ticket is filed in, and why it was raised.
 *
 * Why: the planner picks a lane per ticket and the engine may only raise it (d-0141 item 9). The
 *   size checks must read what the planner wrote, the ticket's own `body`, not the filed text
 *   that adds acceptance criteria, files and a footer, or a short Express ticket was lifted to
 *   Standard by text it never wrote (T2 in the eval). A raise is never silent: its reasons come
 *   back as a line the owner reads ("Lane raised from express to standard: 4 files predicted").
 *   A lane the owner set (`lane_by_owner`) is honoured: the size checks leave it alone, but a
 *   Tier C path still forces Full (d-0177, d-0012).
 *
 * Exports: PlanTicketLane, planTicketLane().
 * Depends on: @forge/core (preCheckLane, maxLane, globMatch, PlanTicket). No IO.
 */

import { globMatch, maxLane, preCheckLane } from '@forge/core';
import type { PlanTicket } from '@forge/core';
import type { PlanTicketLane } from '#/types/plan-ticket-lane.types.js';

/** The lane to file `t` in, whether it is Tier C, and the line saying why it was raised (null when it was not). */
export function planTicketLane(
  t: Pick<PlanTicket, 'lane' | 'files' | 'body' | 'lane_by_owner'>,
  tierCGlobs: readonly string[],
): PlanTicketLane {
  const tierC = t.files.some((f) => tierCGlobs.some((g) => globMatch(g, f, true)));
  const pre = preCheckLane({
    touchedPaths: t.files,
    tierCGlobs,
    bodyLength: t.body.length,
    type: 'feat',
  });

  const lane =
    t.lane_by_owner === true
      ? tierC
        ? maxLane(t.lane, 'full')
        : t.lane
      : maxLane(t.lane, pre.lane);

  const reasons =
    t.lane_by_owner === true
      ? pre.reasons.filter((r) => r.startsWith('tier-C'))
      : pre.reasons;

  return {
    lane,
    tierC,
    note:
      lane === t.lane
        ? null
        : `Lane raised from ${t.lane} to ${lane}: ${reasons.join('; ')}`,
  };
}

/**
 * computeProjectStats — turns a project's tickets, runs and gate verdicts into Home figures.
 *
 * Why: Home must show how a project is doing from facts Forge already holds, with no new
 *   tables and no invented numbers. Keeping the arithmetic in one pure function, away from
 *   storage and HTTP, lets the rules be pinned by tests: what counts as "done on a day",
 *   how lead time is measured, that skipped gates do not dilute the pass rate and that a
 *   figure with no data is `null` rather than a misleading zero.
 *
 * Exports: computeProjectStats().
 * Depends on: domain/stats-window, schemas/*, types/project-stats-input.types. No IO.
 */

import {
  bump,
  dayOf,
  denseSeries,
  durationStats,
  rateStat,
  statsWindow,
} from '#/domain/stats-window.js';
import type { ProjectStats } from '#/schemas/project-stats.js';
import { TicketStatus } from '#/schemas/ticket.js';
import type { ProjectStatsInput } from '#/types/project-stats-input.types.js';

export function computeProjectStats(input: ProjectStatsInput): ProjectStats {
  const { days, ...window } = statsWindow(input.range, input.nowMs);
  const inWindow = (iso: string): boolean => iso >= window.from && iso <= window.to;

  const counts = Object.fromEntries(
    TicketStatus.options.map((s) => [s, 0]),
  ) as ProjectStats['tickets_by_state'];

  const doneByDay = new Map<string, number>();
  const leadTimes: number[] = [];
  let created = 0;
  let reworked = 0;

  for (const t of input.tickets) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
    if (t.status === 'done' && inWindow(t.updated_at)) {
      bump(doneByDay, dayOf(t.updated_at));
      leadTimes.push(Math.max(0, Date.parse(t.updated_at) - Date.parse(t.created_at)));
    }

    if (inWindow(t.created_at)) {
      created += 1;
      reworked += t.rework_count > 0 ? 1 : 0;
    }
  }

  const runsByDay = new Map<string, number>();
  const spendByDay = new Map<string, number>();
  let withCost = 0;
  for (const r of input.runs) {
    bump(runsByDay, dayOf(r.started_at));
    if (r.cost_usd !== undefined) {
      withCost += 1;
      bump(spendByDay, dayOf(r.started_at), r.cost_usd);
    }
  }

  const g1 = input.gates.filter(
    (g) => g.gate === 'G1' && g.status !== 'skipped' && inWindow(g.started_at),
  );

  return {
    ...window,
    project: input.project,
    tickets_by_state: counts,
    throughput: denseSeries(days, doneByDay),
    lead_time: durationStats(leadTimes),
    rework_rate: rateStat(reworked, created),
    gate_pass_rate: rateStat(g1.filter((g) => g.status === 'passed').length, g1.length),
    runs_per_day: denseSeries(days, runsByDay),
    active_workers: input.activeRuns,
    spend_per_day: denseSeries(days, spendByDay),
    cost_coverage: { runs_total: input.runs.length, runs_with_cost: withCost },
  };
}

/**
 * computeOverviewStats — sums every project's tickets, runs, gates and waiting items into the
 * Overview dashboard.
 *
 * Why: the owner of several projects wants one answer to "how is all the work going, what
 *   waits on me, what does it cost". The numbers are the per-project facts (same window rules
 *   as Home and Cost) summed and cut into UTC day, week or month buckets. Spend is only what
 *   runs recorded: a run with no cost is counted in `cost_coverage` but adds no dollars, and
 *   nothing is priced from tokens. Keeping this pure, away from storage and HTTP, lets tests
 *   pin the rules that would otherwise mislead: money landing in the wrong project or bucket,
 *   this-month spend shifting with the range, or a quiet project looking active.
 *
 * Exports: computeOverviewStats(), overviewRunsSince().
 * Depends on: domain/bucketize, domain/overview-lists, domain/stats-window, schemas/*, types/overview-stats-input.types. No IO.
 */

import { bucketKeyOf, bucketize } from '#/domain/bucketize.js';
import { rateStat, statsWindow } from '#/domain/stats-window.js';
import { attentionOf, byWaitingThenActivity } from '#/domain/overview-lists.js';
import type { OverviewStats } from '#/schemas/overview-stats.js';
import type { Run } from '#/schemas/run.js';
import { STATS_RANGE_DAYS } from '#/schemas/stats-range.js';
import type { StatsRange } from '#/schemas/stats-range.js';
import type {
  OverviewProjectInput,
  OverviewStatsInput,
} from '#/types/overview-stats-input.types.js';

const DAY_MS = 86_400_000;

/** Ticket states that mean work is moving (as opposed to waiting on a person or queued). */
const MOVING = new Set(['in_progress', 'verifying']);
const FAILED = new Set(['refused', 'max_turns', 'timeout', 'error']);
const STOPPED = new Set(['interrupted', 'cancelled']);

const monthStartMs = (nowMs: number): number => {
  const d = new Date(nowMs);

  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/**
 * Earliest run start the server must read: the start of the previous period (for the change
 * figure) or of this month, whichever is earlier. `all` reads everything (undefined).
 */
export function overviewRunsSince(
  range: StatsRange,
  nowMs: number,
  utcOffsetMinutes = 0,
): string | undefined {
  if (range === 'all') {
    return undefined;
  }

  const { from } = statsWindow(range, nowMs, undefined, utcOffsetMinutes);
  const prevFromMs = Date.parse(from) - STATS_RANGE_DAYS[range] * DAY_MS;

  return new Date(Math.min(prevFromMs, monthStartMs(nowMs))).toISOString();
}

function earliestMs(projects: readonly OverviewProjectInput[]): number | undefined {
  let first: number | undefined;

  for (const p of projects) {
    for (const iso of [
      ...p.tickets.map((t) => t.created_at),
      ...p.runs.map((r) => r.started_at),
    ]) {
      const ms = Date.parse(iso);
      first = first === undefined ? ms : Math.min(first, ms);
    }
  }

  return first;
}

const zeros = (n: number): number[] => new Array<number>(n).fill(0);

function slices(totals: Map<string, number>): { key: string; usd: number }[] {
  return [...totals]
    .filter(([, usd]) => usd > 0)
    .map(([key, usd]) => ({ key, usd }))
    .sort((a, b) => b.usd - a.usd || (a.key < b.key ? -1 : 1));
}

const add = (map: Map<string, number>, key: string, amount: number): void => {
  map.set(key, (map.get(key) ?? 0) + amount);
};

export function computeOverviewStats(input: OverviewStatsInput): OverviewStats {
  const { range, group, nowMs, projects } = input;
  const offset = input.utcOffsetMinutes ?? 0;
  const span = statsWindow(
    range,
    nowMs,
    range === 'all' ? earliestMs(projects) : undefined,
    offset,
  );

  const window = { from: span.from, to: span.to };

  const buckets = bucketize(window, group, offset);
  const slot = new Map(buckets.map((key, i) => [key, i]));
  const at = (iso: string): number => slot.get(bucketKeyOf(iso, group, offset)) ?? -1;
  const inWindow = (iso: string): boolean => iso >= window.from && iso <= window.to;

  const prevFrom =
    range === 'all'
      ? null
      : new Date(
          Date.parse(window.from) - STATS_RANGE_DAYS[range] * DAY_MS,
        ).toISOString();

  // Today is compared with yesterday up to the same time of day, so a morning is not judged
  // against a whole day's spend. Other ranges compare with the whole previous period.
  const prevTo =
    range === 'today' && prevFrom !== null
      ? new Date(Date.parse(prevFrom) + (nowMs - Date.parse(window.from))).toISOString()
      : window.from;

  const monthFrom = new Date(monthStartMs(nowMs)).toISOString();

  const done = zeros(buckets.length);
  const started = zeros(buckets.length);
  const passed = zeros(buckets.length);
  const failed = zeros(buckets.length);
  const stopped = zeros(buckets.length);
  const byHarness = new Map<string, number>();
  const byLane = new Map<string, number>();
  const byProject = new Map<string, number>();
  const spendSeries: OverviewStats['spend_by_project'] = [];
  const rows: OverviewStats['projects'] = [];

  let spend = 0;
  let spendPrev = 0;
  let spendMonth = 0;
  let runsTotal = 0;
  let withCost = 0;
  let inProgress = 0;
  let workers = 0;
  let waiting = 0;
  let activeProjects = 0;
  const g1 = { hits: 0, total: 0 };

  const compare = (a: Run, b: Run): number => (a.started_at < b.started_at ? -1 : 1);

  for (const p of projects) {
    const values = zeros(buckets.length);
    const spark = zeros(buckets.length);
    let projectSpend = 0;
    let projectRuns = 0;
    let latest: string | null = null;
    const seen = (iso: string): void => {
      latest = latest === null || iso > latest ? iso : latest;
    };

    for (const t of p.tickets) {
      seen(t.updated_at);
      inProgress += MOVING.has(t.status) ? 1 : 0;

      if (inWindow(t.created_at)) {
        started[at(t.created_at)] = (started[at(t.created_at)] ?? 0) + 1;
      }

      if (t.status === 'done' && inWindow(t.updated_at)) {
        done[at(t.updated_at)] = (done[at(t.updated_at)] ?? 0) + 1;
      }
    }

    for (const r of [...p.runs].sort(compare)) {
      const cost = r.cost_usd;

      if (cost !== undefined) {
        spendMonth += r.started_at >= monthFrom ? cost : 0;
        spendPrev +=
          prevFrom !== null && r.started_at >= prevFrom && r.started_at < prevTo
            ? cost
            : 0;
      }

      if (!inWindow(r.started_at)) {
        continue;
      }

      const i = at(r.started_at);
      seen(r.started_at);
      projectRuns += 1;
      runsTotal += 1;
      spark[i] = (spark[i] ?? 0) + 1;

      if (r.status === 'success') {
        passed[i] = (passed[i] ?? 0) + 1;
      } else if (FAILED.has(r.status)) {
        failed[i] = (failed[i] ?? 0) + 1;
      } else if (STOPPED.has(r.status)) {
        stopped[i] = (stopped[i] ?? 0) + 1;
      }

      if (cost !== undefined) {
        withCost += 1;
        spend += cost;
        projectSpend += cost;
        values[i] = (values[i] ?? 0) + cost;
        add(byHarness, r.harness, cost);
        add(byLane, r.lane, cost);
      }
    }

    for (const g of p.gates) {
      if (g.gate === 'G1' && g.status !== 'skipped' && inWindow(g.started_at)) {
        g1.total += 1;
        g1.hits += g.status === 'passed' ? 1 : 0;
      }
    }

    workers += p.activeRuns;
    waiting += p.needsAction.length;
    activeProjects += projectRuns > 0 || p.activeRuns > 0 ? 1 : 0;
    byProject.set(p.slug, projectSpend);
    spendSeries.push({ project: p.slug, values });
    rows.push({
      slug: p.slug,
      status: p.status,
      open_cards: p.openCards,
      tickets_in_progress: p.tickets.filter((t) => MOVING.has(t.status)).length,
      waiting_on_you: p.needsAction.length,
      spend_usd: projectSpend,
      last_activity: latest,
      spark,
    });
  }

  rows.sort(byWaitingThenActivity);

  return {
    range,
    group,
    from: window.from,
    to: window.to,
    buckets,
    projects_included: projects.map((p) => p.slug),
    unknown: [...input.unknown],
    kpis: {
      spend_usd: spend,
      spend_prev_usd: prevFrom === null ? null : spendPrev,
      spend_this_month_usd: spendMonth,
      tickets_done: done.reduce((a, b) => a + b, 0),
      tickets_in_progress: inProgress,
      waiting_on_you: waiting,
      workers_running: workers,
      active_projects: activeProjects,
      g1_pass_rate: rateStat(g1.hits, g1.total),
    },
    spend_by_project: spendSeries,
    tickets_done: done,
    tickets_started: started,
    runs_passed: passed,
    runs_failed: failed,
    runs_interrupted: stopped,
    spend_by_project_total: slices(byProject),
    spend_by_harness: slices(byHarness),
    spend_by_lane: slices(byLane),
    projects: rows,
    attention: attentionOf(projects),
    cost_coverage: { runs_total: runsTotal, runs_with_cost: withCost },
  };
}

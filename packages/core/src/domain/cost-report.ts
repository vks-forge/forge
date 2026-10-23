/**
 * computeCostReport — adds up what runs recorded: dollars, tokens, by day, ticket, run,
 * harness and model.
 *
 * Why: the owner of a project asks where the money went. Forge only has what harnesses
 *   reported: a run's `cost_usd` (some harnesses report none) and token counts per model. The
 *   report sums exactly that, keeps runs without a cost in the token and run totals but out of
 *   the dollar sums (and says how many they were), and never prices tokens itself, because a
 *   guessed price shown as spend is worse than a visible gap. Pure so the sums and the
 *   ordering can be pinned by tests. The Director's steps are added from their own dated
 *   ledger and kept as a separate figure, so the total is the whole project's spend and the
 *   split says how much of it was Workers and how much the Director.
 *
 * Exports: computeCostReport(), tokensOf().
 * Depends on: domain/stats-window, schemas/*, types/cost-report-input.types. No IO.
 */

import { bump, dayOf, denseSeries, statsWindow } from '#/domain/stats-window.js';
import { COST_TOP_N } from '#/schemas/cost-report.js';
import type { CostReport, TokenTotals } from '#/schemas/cost-report.js';
import type { Usage } from '#/schemas/run.js';
import type { CostBucket, CostReportInput } from '#/types/cost-report-input.types.js';

const zero = (): TokenTotals => ({ in: 0, out: 0, cached_in: 0, cache_write: 0 });

/** Core `Usage` (camelCase) as the API's token shape. */
export function tokensOf(usage: Usage | undefined): TokenTotals {
  return usage === undefined
    ? zero()
    : {
        in: usage.in,
        out: usage.out,
        cached_in: usage.cachedIn,
        cache_write: usage.cacheWrite,
      };
}

function addTokens(into: TokenTotals, add: TokenTotals): void {
  into.in += add.in;
  into.out += add.out;
  into.cached_in += add.cached_in;
  into.cache_write += add.cache_write;
}

function bucketOf<K>(map: Map<K, CostBucket>, key: K): CostBucket {
  const found = map.get(key);
  if (found) {
    return found;
  }

  const fresh: CostBucket = { cost_usd: 0, runs: 0, tokens: zero() };
  map.set(key, fresh);

  return fresh;
}

/** Highest spend first; ties and cost-less runs fall back to newest start, then id. */
function bySpend(
  a: { cost: number; started: string; id: string },
  b: { cost: number; started: string; id: string },
): number {
  return (
    b.cost - a.cost ||
    (a.started < b.started ? 1 : a.started > b.started ? -1 : 0) ||
    (a.id < b.id ? -1 : 1)
  );
}

export function computeCostReport(input: CostReportInput): CostReport {
  const { days, ...window } = statsWindow(input.range, input.nowMs);
  const perDay = new Map<string, number>();
  const tickets = new Map<string, CostBucket>();
  const harnesses = new Map<string, CostBucket>();
  const models = new Map<string, TokenTotals>();
  const total = zero();
  const perDayDirector = new Map<string, number>();
  let workerUsd = 0;
  let directorUsd = 0;
  let withCost = 0;
  let directorSteps = 0;
  let directorRecorded = 0;

  for (const r of input.runs) {
    const tokens = tokensOf(r.usage);
    addTokens(total, tokens);
    for (const [model, usage] of Object.entries(r.usage?.byModel ?? {})) {
      const slot = models.get(model) ?? zero();
      addTokens(slot, tokensOf(usage));
      models.set(model, slot);
    }

    for (const bucket of [
      bucketOf(tickets, r.ticket_id),
      bucketOf(harnesses, r.harness),
    ]) {
      bucket.runs += 1;
      addTokens(bucket.tokens, tokens);
      bucket.cost_usd += r.cost_usd ?? 0;
    }

    if (r.cost_usd !== undefined) {
      withCost += 1;
      workerUsd += r.cost_usd;
      bump(perDay, dayOf(r.started_at), r.cost_usd);
    }
  }

  const perDayWorker = new Map(perDay);
  for (const d of input.directorSpend) {
    if (d.at < window.from || d.at > window.to) {
      continue;
    }

    directorSteps += 1;
    directorRecorded += d.recorded ? 1 : 0;
    directorUsd += d.usd;
    bump(perDayDirector, dayOf(d.at), d.usd);
    bump(perDay, dayOf(d.at), d.usd);
  }

  const byRun = input.runs
    .map((r) => ({
      cost: r.cost_usd ?? -1,
      started: r.started_at,
      id: r.id,
      row: {
        run_id: r.id,
        ticket_id: r.ticket_id,
        harness: r.harness,
        started_at: r.started_at,
        cost_usd: r.cost_usd ?? null,
        tokens: tokensOf(r.usage),
      },
    }))
    .sort(bySpend);

  const runPage = input.page?.run ?? { limit: COST_TOP_N, offset: 0 };
  const ticketPage = input.page?.ticket ?? { limit: COST_TOP_N, offset: 0 };

  const rankedTickets = [...tickets.entries()].sort(
    ([ia, a], [ib, b]) => b.cost_usd - a.cost_usd || (ia < ib ? -1 : 1),
  );

  const byTicket = rankedTickets
    .slice(ticketPage.offset, ticketPage.offset + ticketPage.limit)
    .map(([ticket_id, b]) => {
      const title = input.titles.get(ticket_id);

      return { ticket_id, ...(title === undefined ? {} : { title }), ...b };
    });

  return {
    ...window,
    project: input.project,
    total_usd: workerUsd + directorUsd,
    worker_usd: workerUsd,
    director_usd: directorUsd,
    runs_total: input.runs.length,
    runs_with_cost: withCost,
    director_steps_total: directorSteps,
    director_steps_recorded: directorRecorded,
    tokens: total,
    per_day: denseSeries(days, perDay),
    per_day_split: days.map((date) => ({
      date,
      worker_usd: perDayWorker.get(date) ?? 0,
      director_usd: perDayDirector.get(date) ?? 0,
    })),
    by_ticket: byTicket,
    by_ticket_total: rankedTickets.length,
    by_run: byRun.slice(runPage.offset, runPage.offset + runPage.limit).map((x) => x.row),
    by_run_total: byRun.length,
    by_harness: [...harnesses.entries()]
      .sort(([ia, a], [ib, b]) => b.cost_usd - a.cost_usd || (ia < ib ? -1 : 1))
      .map(([harness, b]) => ({ harness, ...b })),
    by_model: [...models.entries()]
      .sort(([ia], [ib]) => (ia < ib ? -1 : 1))
      .map(([model, tokens]) => ({ model, tokens })),
    budgets: { ...input.budgets, period_usd: null },
  };
}

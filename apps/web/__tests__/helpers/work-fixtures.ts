/**
 * Builders for the server's stats, cost, inbox and run answers, with sensible defaults.
 *
 * Why: tests of Home, Inbox, Runs and Cost need whole, schema-valid server bodies (the http
 *   adapter parses them with core's schemas), but each test cares about one or two fields.
 *   A builder per shape lets a test say only what matters ("lead time is null") and keeps the
 *   rest valid, so a failure points at the behaviour under test and not at a malformed fixture.
 *
 * Exports: day(), overviewBody(), costBody(), inboxItem(), runSummary(), runDetail(), ticketSummary(),
 *   PROJECTS_REPLY.
 * Depends on: @forge/core (types only). No IO.
 */

import type {
  CostReport,
  InboxItem,
  OverviewStats,
  RunDetail,
  RunSummary,
  TicketSummary,
} from '@forge/core';

export const PROJECTS_REPLY = {
  projects: [
    {
      id: 'p-1',
      slug: 'sample-service',
      prefix: 'SVC',
      status: 'ready',
      ecosystems: ['node'],
    },
  ],
};

const NOW = '2026-10-16T12:00:00.000Z';

/** `n` consecutive UTC days ending 2026-10-16, each with `value(i)`. */
export function day(n: number, value: (i: number) => number = () => 0) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 16 - (n - 1 - i)));

    return { date: d.toISOString().slice(0, 10), value: value(i) };
  });
}

const TOKENS = { in: 12_000, out: 3_000, cached_in: 40_000, cache_write: 0 };

export function costBody(over: Partial<CostReport> = {}): CostReport {
  return {
    range: '30d',
    from: '2026-09-17T00:00:00.000Z',
    to: NOW,
    project: 'sample-service',
    total_usd: 4.25,
    worker_usd: 4.25,
    director_usd: 0,
    runs_total: 6,
    runs_with_cost: 5,
    director_steps_total: 0,
    director_steps_recorded: 0,
    tokens: TOKENS,
    per_day: day(30, (i) => (i === 29 ? 4.25 : 0)),
    per_day_split: day(30, (i) => (i === 29 ? 4.25 : 0)).map((p) => ({
      date: p.date,
      worker_usd: p.value,
      director_usd: 0,
    })),
    by_ticket: [
      {
        ticket_id: 'SVC-3',
        title: 'Stream large CSV',
        cost_usd: 3,
        runs: 2,
        tokens: TOKENS,
      },
    ],
    by_run: [
      {
        run_id: 'run-1',
        ticket_id: 'SVC-3',
        harness: 'claude',
        started_at: '2026-10-16T09:00:00.000Z',
        cost_usd: 3,
        tokens: TOKENS,
      },
      {
        run_id: 'run-2',
        ticket_id: 'SVC-4',
        harness: 'codex',
        started_at: '2026-10-15T09:00:00.000Z',
        cost_usd: null,
        tokens: TOKENS,
      },
    ],
    by_harness: [{ harness: 'claude', cost_usd: 4.25, runs: 5, tokens: TOKENS }],
    by_model: [{ model: 'claude-sonnet-x', tokens: TOKENS }],
    budgets: { run_max_usd: 5, step_budget_usd: 1, period_usd: null },
    ...over,
  };
}

export function inboxItem(over: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'question:q-1',
    kind: 'question',
    project: 'sample-service',
    title: 'Worker asks about migrations',
    detail: 'SVC-3',
    ticket_id: 'SVC-3',
    needs_action: true,
    updated_at: '2026-10-16T10:00:00.000Z',
    read: false,
    archived: false,
    ...over,
  };
}

export function runSummary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    id: 'run-1',
    ticket_id: 'SVC-3',
    ticket_title: 'Stream large CSV',
    project: 'sample-service',
    harness: 'claude',
    lane: 'standard',
    status: 'success',
    started_at: '2026-10-16T09:00:00.000Z',
    ended_at: '2026-10-16T09:12:00.000Z',
    duration_ms: 720_000,
    generation: 1,
    paused_harness: false,
    cost_usd: 1.2,
    tokens: TOKENS,
    ...over,
  };
}

export function runDetail(over: Partial<RunDetail> = {}): RunDetail {
  return {
    ...runSummary(),
    cwd: '/work/sample-service/svc-3',
    driver_version: '1.4.0',
    owner: 'server-1',
    session_ref: 'sess-abc',
    tokens_by_model: { 'claude-sonnet-x': TOKENS },
    gates: [
      {
        id: 1,
        run_id: 'run-1',
        gate: 'G1',
        status: 'passed',
        head_sha: 'abcdef1234567',
        started_at: '2026-10-16T09:10:00.000Z',
      },
      {
        id: 2,
        run_id: 'run-1',
        gate: 'G2',
        status: 'failed',
        started_at: '2026-10-16T09:11:00.000Z',
      },
    ],
    ...over,
  };
}

export function ticketSummary(over: Partial<TicketSummary> = {}): TicketSummary {
  return {
    id: 'SVC-3' as TicketSummary['id'],
    title: 'Stream large CSV',
    state: 'in_progress',
    lane: 'standard',
    type: 'feat',
    tier_predicted: 'A',
    project: 'sample-service',
    priority: 0,
    rework_count: 0,
    needs_you: false,
    created_at: '2026-10-10T09:00:00.000Z',
    updated_at: '2026-10-16T09:00:00.000Z',
    ...over,
  };
}

/** `GET /stats/overview` for two live projects over a week of days, one with spend and one waiting. */
export function overviewBody(over: Partial<OverviewStats> = {}): OverviewStats {
  const week = (f: (i: number) => number) => Array.from({ length: 7 }, (_, i) => f(i));

  return {
    range: '7d',
    group: 'day',
    from: '2026-10-10T00:00:00.000Z',
    to: NOW,
    buckets: week((i) => 10 + i).map((d) => `2026-10-${d}`),
    projects_included: ['sample-service', 'sample-web'],
    unknown: [],
    kpis: {
      spend_usd: 7.5,
      spend_worker_usd: 7.5,
      spend_director_usd: 0,
      spend_prev_usd: 5,
      spend_this_month_usd: 21.25,
      tickets_done: 4,
      tickets_in_progress: 2,
      waiting_on_you: 2,
      workers_running: 1,
      active_projects: 2,
      g1_pass_rate: { hits: 3, total: 4, rate: 0.75 },
    },
    spend_by_project: [
      {
        project: 'sample-service',
        values: week((i) => (i === 6 ? 4.5 : 0)),
        director_values: week(() => 0),
      },
      {
        project: 'sample-web',
        values: week((i) => (i === 5 ? 3 : 0)),
        director_values: week(() => 0),
      },
    ],
    spend_by_source: [
      { source: 'worker', values: week((i) => (i === 6 ? 4.5 : i === 5 ? 3 : 0)) },
      { source: 'director', values: week(() => 0) },
    ],
    tickets_done: week((i) => (i === 6 ? 4 : 0)),
    tickets_started: week((i) => (i % 2 === 0 ? 1 : 0)),
    runs_passed: week((i) => (i === 6 ? 5 : 0)),
    runs_failed: week((i) => (i === 5 ? 1 : 0)),
    runs_interrupted: week(() => 0),
    spend_by_project_total: [
      { key: 'sample-service', usd: 4.5, worker_usd: 4.5, director_usd: 0 },
      { key: 'sample-web', usd: 3, worker_usd: 3, director_usd: 0 },
    ],
    spend_by_harness: [
      { key: 'claude', usd: 6 },
      { key: 'codex', usd: 1.5 },
    ],
    spend_by_lane: [{ key: 'standard', usd: 7.5 }],
    projects: [
      {
        slug: 'sample-service',
        status: 'ready',
        open_cards: 3,
        tickets_in_progress: 1,
        waiting_on_you: 1,
        spend_usd: 4.5,
        director_usd: 0,
        last_activity: '2026-10-16T10:00:00.000Z',
        spark: week((i) => i % 3),
      },
      {
        slug: 'sample-web',
        status: 'ready',
        open_cards: 1,
        tickets_in_progress: 1,
        waiting_on_you: 1,
        spend_usd: 3,
        director_usd: 0,
        last_activity: '2026-10-15T08:00:00.000Z',
        spark: week(() => 0),
      },
    ],
    attention: [
      {
        id: 'question:q-1',
        kind: 'question',
        project: 'sample-service',
        title: 'Worker asks about migrations',
        ticket_id: 'SVC-3',
        updated_at: '2026-10-16T10:00:00.000Z',
      },
      {
        id: 'tool_approval:claude/2.1.142/shell',
        kind: 'tool_approval',
        project: 'sample-web',
        title: 'Approve tool shell',
        updated_at: '2026-10-15T08:00:00.000Z',
      },
    ],
    cost_coverage: {
      runs_total: 6,
      runs_with_cost: 5,
      director_steps: 0,
      director_steps_recorded: 0,
    },
    ...over,
  };
}

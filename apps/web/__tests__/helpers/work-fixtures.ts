/**
 * Builders for the server's stats, cost, inbox and run answers, with sensible defaults.
 *
 * Why: tests of Home, Inbox, Runs and Cost need whole, schema-valid server bodies (the http
 *   adapter parses them with core's schemas), but each test cares about one or two fields.
 *   A builder per shape lets a test say only what matters ("lead time is null") and keeps the
 *   rest valid, so a failure points at the behaviour under test and not at a malformed fixture.
 *
 * Exports: day(), statsBody(), costBody(), inboxItem(), runSummary(), runDetail(), ticketSummary(),
 *   PROJECTS_REPLY.
 * Depends on: @forge/core (types only). No IO.
 */

import type {
  CostReport,
  InboxItem,
  ProjectStats,
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

const TICKET_STATES = {
  inbox: 0,
  planned: 1,
  in_progress: 2,
  blocked: 0,
  waiting_human: 1,
  verifying: 0,
  review: 0,
  needs_signoff: 0,
  done: 4,
  cancelled: 0,
};

export function statsBody(over: Partial<ProjectStats> = {}): ProjectStats {
  return {
    range: '30d',
    from: '2026-09-17T00:00:00.000Z',
    to: NOW,
    project: 'sample-service',
    tickets_by_state: TICKET_STATES,
    throughput: day(30, (i) => (i === 29 ? 2 : 0)),
    lead_time: { count: 4, median_ms: 7_200_000, p90_ms: 18_000_000 },
    rework_rate: { hits: 1, total: 5, rate: 0.2 },
    gate_pass_rate: { hits: 3, total: 4, rate: 0.75 },
    runs_per_day: day(30, (i) => i % 3),
    active_workers: 1,
    spend_per_day: day(30, (i) => (i === 29 ? 1.5 : 0)),
    cost_coverage: { runs_total: 6, runs_with_cost: 5 },
    ...over,
  };
}

const TOKENS = { in: 12_000, out: 3_000, cached_in: 40_000, cache_write: 0 };

export function costBody(over: Partial<CostReport> = {}): CostReport {
  return {
    range: '30d',
    from: '2026-09-17T00:00:00.000Z',
    to: NOW,
    project: 'sample-service',
    total_usd: 4.25,
    runs_total: 6,
    runs_with_cost: 5,
    tokens: TOKENS,
    per_day: day(30, (i) => (i === 29 ? 4.25 : 0)),
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

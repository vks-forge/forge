/**
 * Pins the Home stats and Cost report arithmetic.
 *
 * Why: Home and Cost are read as facts. A window that starts on the wrong day, a skipped gate
 *   that dilutes the pass rate, a zero where there is no data, or a cost-less run counted as
 *   free would each mislead the owner. These cases fix the rules once.
 *
 * Pins: dense UTC-day series, done-per-day and lead time, rework and G1 rates, null on no
 *   data, active workers, spend only from runs with a cost, per-ticket / harness / model sums.
 * Depends on: src/domain/project-stats, src/domain/cost-report, src/domain/stats-window. No IO.
 */

import { describe, expect, it } from 'vitest';
import { computeCostReport } from '#/domain/cost-report.js';
import { computeProjectStats } from '#/domain/project-stats.js';
import { percentile, statsWindow } from '#/domain/stats-window.js';
import type { Run } from '#/schemas/run.js';
import type { Ticket } from '#/schemas/ticket.js';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

const ticket = (n: number, over: Partial<Ticket> = {}): Ticket => ({
  id: `SF-${n}` as Ticket['id'],
  project: 'p',
  title: `T${n}`,
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'inbox',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: '2026-10-15T00:00:00.000Z',
  updated_at: '2026-10-15T00:00:00.000Z',
  blocked_by: [],
  ...over,
});

const run = (id: string, over: Partial<Run> = {}): Run => ({
  id,
  ticket_id: 'SF-1',
  harness: 'claude',
  driver_version: '1',
  cwd: '/x',
  lane: 'express',
  started_at: '2026-10-16T01:00:00.000Z',
  status: 'success',
  owner: 'o',
  ...over,
});

describe('statsWindow', () => {
  it('covers N whole UTC days ending today, oldest first', () => {
    const w = statsWindow('7d', NOW);

    expect(w.days).toHaveLength(7);
    expect(w.days[0]).toBe('2026-10-10');
    expect(w.days[6]).toBe('2026-10-16');
    expect(w.from).toBe('2026-10-10T00:00:00.000Z');
  });

  it('uses nearest-rank percentiles and null for no samples', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('computeProjectStats', () => {
  const base = {
    project: 'p',
    range: '7d' as const,
    nowMs: NOW,
    runs: [],
    gates: [],
    activeRuns: 0,
  };

  it('reports null (not zero) when nothing finished, gated or was created', () => {
    const s = computeProjectStats({ ...base, tickets: [] });

    expect(s.lead_time).toEqual({ count: 0, median_ms: null, p90_ms: null });
    expect(s.rework_rate.rate).toBeNull();
    expect(s.gate_pass_rate.rate).toBeNull();
    expect(s.throughput.every((p) => p.value === 0)).toBe(true);
    expect(s.tickets_by_state['done']).toBe(0);
  });

  it('counts states, done per day, lead time and rework of tickets created in the window', () => {
    const s = computeProjectStats({
      ...base,
      tickets: [
        ticket(1, { status: 'done', updated_at: '2026-10-15T10:00:00.000Z' }),
        ticket(2, {
          status: 'done',
          rework_count: 2,
          updated_at: '2026-10-15T02:00:00.000Z',
        }),
        ticket(3, { status: 'review' }),
        ticket(4, {
          status: 'done',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        }),
      ],
    });

    expect(s.tickets_by_state).toMatchObject({ done: 3, review: 1, inbox: 0 });
    expect(s.throughput.find((p) => p.date === '2026-10-15')?.value).toBe(2);
    expect(s.lead_time.count).toBe(2);
    expect(s.lead_time.median_ms).toBe(2 * 3_600_000);
    expect(s.rework_rate).toEqual({ hits: 1, total: 3, rate: 1 / 3 });
  });

  it('computes the G1 pass rate without skipped verdicts and counts workers and spend', () => {
    const g = (
      id: number,
      status: 'passed' | 'failed' | 'skipped',
      gate: 'G1' | 'G2' = 'G1',
    ) => ({
      id,
      run_id: 'r1',
      gate,
      status,
      started_at: '2026-10-16T02:00:00.000Z',
    });

    const s = computeProjectStats({
      ...base,
      tickets: [],
      activeRuns: 2,
      gates: [g(1, 'passed'), g(2, 'failed'), g(3, 'skipped'), g(4, 'failed', 'G2')],
      runs: [run('r1', { cost_usd: 1.5 }), run('r2')],
    });

    expect(s.gate_pass_rate).toEqual({ hits: 1, total: 2, rate: 0.5 });
    expect(s.active_workers).toBe(2);
    expect(s.runs_per_day.at(-1)?.value).toBe(2);
    expect(s.spend_per_day.at(-1)?.value).toBe(1.5);
    expect(s.cost_coverage).toEqual({ runs_total: 2, runs_with_cost: 1 });
  });
});

describe('computeCostReport', () => {
  const usage = (n: number) => ({ in: n, out: n, cachedIn: 0, cacheWrite: 0 });
  const input = {
    project: 'p',
    range: '7d' as const,
    nowMs: NOW,
    titles: new Map([['SF-1', 'First']]),
    budgets: { run_max_usd: 5, step_budget_usd: 1 },
  };

  it('sums only recorded cost, keeps tokens of cost-less runs and never prices tokens', () => {
    const r = computeCostReport({
      ...input,
      runs: [
        run('a', { cost_usd: 2, usage: { ...usage(10), byModel: { m1: usage(10) } } }),
        run('b', { ticket_id: 'SF-2', harness: 'codex', usage: usage(5) }),
      ],
    });

    expect(r.total_usd).toBe(2);
    expect(r.runs_with_cost).toBe(1);
    expect(r.tokens.in).toBe(15);
    expect(r.by_ticket[0]).toMatchObject({
      ticket_id: 'SF-1',
      title: 'First',
      cost_usd: 2,
    });

    expect(r.by_ticket[1]).toMatchObject({ ticket_id: 'SF-2', cost_usd: 0, runs: 1 });
    expect(r.by_run.map((x) => x.run_id)).toEqual(['a', 'b']);
    expect(r.by_run[1]?.cost_usd).toBeNull();
    expect(r.by_harness.map((h) => h.harness)).toEqual(['claude', 'codex']);
    expect(r.by_model).toEqual([
      { model: 'm1', tokens: { in: 10, out: 10, cached_in: 0, cache_write: 0 } },
    ]);

    expect(r.budgets).toEqual({ run_max_usd: 5, step_budget_usd: 1, period_usd: null });
  });

  it('returns a zero-filled series and no rows for an empty window', () => {
    const r = computeCostReport({ ...input, runs: [] });

    expect(r.per_day).toHaveLength(7);
    expect(r.by_run).toEqual([]);
    expect(r.total_usd).toBe(0);
  });
});

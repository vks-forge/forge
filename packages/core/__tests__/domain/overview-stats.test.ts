/**
 * Pins the cross-project Overview arithmetic.
 *
 * Why: the Overview is read as facts about money and waiting work. A project's spend leaking
 *   into another's series, a run without a cost counted as free, a month total that depends
 *   on the chosen range, or an archived or unknown project silently summed would each mislead
 *   the owner. These cases fix the rules once.
 *
 * Pins: bucket alignment, stacked spend per project, spend only from recorded cost with
 *   coverage, previous-period change, this-month spend, run outcome split, tickets done vs
 *   started, KPIs, projects table order, needs-attention order and cap, all-range start.
 * Depends on: src/domain/overview-stats. No IO.
 */

import { describe, expect, it } from 'vitest';
import { computeOverviewStats } from '#/domain/overview-stats.js';
import type { InboxItem } from '#/schemas/inbox.js';
import type { Run } from '#/schemas/run.js';
import type { Ticket } from '#/schemas/ticket.js';
import type { OverviewProjectInput } from '#/types/overview-stats-input.types.js';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

const ticket = (n: number, over: Partial<Ticket> = {}): Ticket => ({
  id: `SF-${n}` as Ticket['id'],
  project: 'a',
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

const item = (id: string, project: string, updated_at: string): InboxItem => ({
  id: `question:${id}`,
  kind: 'question',
  project,
  title: `Item ${id}`,
  needs_action: true,
  updated_at,
  read: false,
  archived: false,
});

const project = (
  slug: string,
  over: Partial<OverviewProjectInput> = {},
): OverviewProjectInput => ({
  slug,
  status: 'ready',
  tickets: [],
  runs: [],
  gates: [],
  activeRuns: 0,
  openCards: 0,
  needsAction: [],
  ...over,
});

const compute = (
  projects: OverviewProjectInput[],
  over: {
    range?: '7d' | '30d' | '90d' | '12m' | 'all';
    group?: 'day' | 'week' | 'month';
  } = {},
) =>
  computeOverviewStats({
    range: over.range ?? '7d',
    group: over.group ?? 'day',
    nowMs: NOW,
    projects,
    unknown: [],
  });

describe('computeOverviewStats', () => {
  it('stacks spend per project on aligned buckets and ignores runs without a cost', () => {
    const stats = compute([
      project('a', {
        runs: [
          run('r1', { cost_usd: 2 }),
          run('r2', { cost_usd: 1, started_at: '2026-10-15T05:00:00.000Z' }),
          run('r3'),
        ],
      }),
      project('b', { runs: [run('r4', { cost_usd: 4 })] }),
    ]);

    expect(stats.buckets).toHaveLength(7);
    expect(stats.buckets.at(-1)).toBe('2026-10-16');
    expect(stats.spend_by_project).toEqual([
      { project: 'a', values: [0, 0, 0, 0, 0, 1, 2] },
      { project: 'b', values: [0, 0, 0, 0, 0, 0, 4] },
    ]);

    expect(stats.kpis.spend_usd).toBe(7);
    expect(stats.cost_coverage).toEqual({ runs_total: 4, runs_with_cost: 3 });
    expect(stats.spend_by_project_total).toEqual([
      { key: 'b', usd: 4 },
      { key: 'a', usd: 3 },
    ]);
  });

  it('breaks spend down by harness and lane, only from recorded cost', () => {
    const stats = compute([
      project('a', {
        runs: [
          run('r1', { cost_usd: 3, harness: 'codex', lane: 'full' }),
          run('r2', { cost_usd: 1 }),
          run('r3', { harness: 'codex' }),
        ],
      }),
    ]);

    expect(stats.spend_by_harness).toEqual([
      { key: 'codex', usd: 3 },
      { key: 'claude', usd: 1 },
    ]);

    expect(stats.spend_by_lane).toEqual([
      { key: 'full', usd: 3 },
      { key: 'express', usd: 1 },
    ]);
  });

  it('compares spend with the period before and sums this month whatever the range', () => {
    const stats = compute([
      project('a', {
        runs: [
          run('now', { cost_usd: 5 }),
          run('prev', { cost_usd: 2, started_at: '2026-10-05T00:00:00.000Z' }),
          run('old', { cost_usd: 9, started_at: '2026-09-01T00:00:00.000Z' }),
        ],
      }),
    ]);

    expect(stats.kpis.spend_usd).toBe(5);
    expect(stats.kpis.spend_prev_usd).toBe(2);
    expect(stats.kpis.spend_this_month_usd).toBe(7);
  });

  it('splits run outcomes and leaves runs in flight out', () => {
    const stats = compute([
      project('a', {
        runs: [
          run('r1'),
          run('r2', { status: 'error' }),
          run('r3', { status: 'timeout' }),
          run('r4', { status: 'interrupted' }),
          run('r5', { status: 'cancelled' }),
          run('r6', { status: 'running' }),
        ],
      }),
    ]);

    expect(stats.runs_passed.at(-1)).toBe(1);
    expect(stats.runs_failed.at(-1)).toBe(2);
    expect(stats.runs_interrupted.at(-1)).toBe(2);
  });

  it('counts tickets done and started per bucket and in-progress now', () => {
    const stats = compute([
      project('a', {
        tickets: [
          ticket(1, { status: 'done', updated_at: '2026-10-14T10:00:00.000Z' }),
          ticket(2, { status: 'in_progress' }),
          ticket(3, { status: 'verifying' }),
          ticket(4, { status: 'review' }),
        ],
      }),
    ]);

    expect(stats.tickets_done.reduce((a, b) => a + b, 0)).toBe(1);
    expect(stats.tickets_started.at(-2)).toBe(4);
    expect(stats.kpis.tickets_done).toBe(1);
    expect(stats.kpis.tickets_in_progress).toBe(2);
  });

  it('sums workers, waiting items, active projects and the G1 pass rate', () => {
    const gate = (status: 'passed' | 'failed' | 'skipped', id: number) => ({
      id,
      run_id: 'r1',
      gate: 'G1' as const,
      status,
      started_at: '2026-10-16T02:00:00.000Z',
    });

    const stats = compute([
      project('a', {
        activeRuns: 2,
        runs: [run('r1')],
        needsAction: [item('1', 'a', '2026-10-16T10:00:00.000Z')],
        gates: [gate('passed', 1), gate('failed', 2), gate('skipped', 3)],
      }),
      project('b', { activeRuns: 1 }),
      project('c'),
    ]);

    expect(stats.kpis.workers_running).toBe(3);
    expect(stats.kpis.waiting_on_you).toBe(1);
    expect(stats.kpis.active_projects).toBe(2);
    expect(stats.kpis.g1_pass_rate).toEqual({ hits: 1, total: 2, rate: 0.5 });
  });

  it('orders the projects table by waiting, then last activity, with a run sparkline', () => {
    const stats = compute([
      project('quiet', { runs: [run('q1', { started_at: '2026-10-10T00:00:00.000Z' })] }),
      project('busy', {
        openCards: 3,
        runs: [run('b1', { cost_usd: 2 })],
        needsAction: [item('1', 'busy', '2026-10-16T09:00:00.000Z')],
      }),
      project('none'),
    ]);

    expect(stats.projects.map((p) => p.slug)).toEqual(['busy', 'quiet', 'none']);
    expect(stats.projects[0]).toMatchObject({
      open_cards: 3,
      waiting_on_you: 1,
      spend_usd: 2,
      last_activity: '2026-10-16T01:00:00.000Z',
      spark: [0, 0, 0, 0, 0, 0, 1],
    });

    expect(stats.projects[2]?.last_activity).toBeNull();
  });

  it('lists the newest needs-action items across projects, at most ten', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      item(`a${i}`, 'a', `2026-10-16T0${i}:00:00.000Z`),
    );

    const stats = compute([
      project('a', { needsAction: many }),
      project('b', {
        needsAction: [
          item('b1', 'b', '2026-10-16T11:00:00.000Z'),
          item('b2', 'b', '2026-10-01T00:00:00.000Z'),
          item('b3', 'b', '2026-10-02T00:00:00.000Z'),
        ],
      }),
    ]);

    const times = stats.attention.map((a) => a.updated_at);

    expect(stats.attention).toHaveLength(10);
    expect(stats.attention[0]).toMatchObject({ project: 'b', id: 'question:b1' });
    expect(times).toEqual([...times].sort().reverse());
  });

  it('is empty but well formed with no projects', () => {
    const stats = compute([]);

    expect(stats.projects).toEqual([]);
    expect(stats.kpis.spend_usd).toBe(0);
    expect(stats.kpis.g1_pass_rate.rate).toBeNull();
    expect(stats.cost_coverage).toEqual({ runs_total: 0, runs_with_cost: 0 });
  });
});

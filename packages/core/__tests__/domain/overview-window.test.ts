/**
 * Pins the Overview's time window: where all time starts, what the previous period is and how
 * far back the server must read runs.
 *
 * Why: the change figure and "this month" need runs from before the visible range, and `all`
 *   has no fixed start. Reading too little would understate last period's spend and make every
 *   change look like growth; reading everything for a 7 day view would load the whole history.
 *
 * Pins: no previous period for all time, all time starting at the first activity, the earliest
 *   run the server reads per range.
 * Depends on: src/domain/overview-stats. No IO.
 */

import { describe, expect, it } from 'vitest';
import { computeOverviewStats, overviewRunsSince } from '#/domain/overview-stats.js';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

const base = (over: { tickets?: never[]; runs?: never[] } = {}) => ({
  slug: 'a',
  status: 'ready' as const,
  tickets: [],
  runs: [],
  gates: [],
  activeRuns: 0,
  openCards: 0,
  needsAction: [],
  ...over,
});

const compute = (projects: ReturnType<typeof base>[], range: 'all' | '7d' = 'all') =>
  computeOverviewStats({ range, group: 'month', nowMs: NOW, projects, unknown: [] });

describe('all time', () => {
  it('has no previous period', () => {
    expect(compute([base()]).kpis.spend_prev_usd).toBeNull();
  });

  it('starts at the first recorded activity', () => {
    const stats = compute([
      {
        ...base(),
        tickets: [
          {
            id: 'SF-1',
            project: 'a',
            title: 't',
            body: 'b',
            type: 'feat',
            lane: 'express',
            tier_predicted: 'A',
            status: 'inbox',
            status_version: 0,
            rework_count: 0,
            priority: 0,
            created_at: '2026-08-20T00:00:00.000Z',
            updated_at: '2026-08-20T00:00:00.000Z',
            blocked_by: [],
          },
        ] as never[],
      },
    ]);

    expect(stats.buckets).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(stats.from).toBe('2026-08-20T00:00:00.000Z');
  });
});

describe('today', () => {
  const run = (started_at: string, cost_usd: number) =>
    ({
      id: started_at,
      started_at,
      status: 'success',
      harness: 'claude',
      lane: 'standard',
      cost_usd,
    }) as never;

  const today = (runs: never[], utcOffsetMinutes = 330) =>
    computeOverviewStats({
      range: 'today',
      group: 'hour',
      nowMs: NOW,
      utcOffsetMinutes,
      projects: [{ ...base(), runs }],
      unknown: [],
    });

  it('starts at the server local midnight and buckets by hour up to now', () => {
    const stats = today([]);

    // NOW is 17:30 in India; local midnight is 18:30 UTC the day before.
    expect(stats.from).toBe('2026-10-15T18:30:00.000Z');
    expect(stats.buckets).toHaveLength(18);
    expect(stats.buckets[17]).toBe('2026-10-16T11:30:00.000Z');
  });

  it('counts a run in the hour it started and leaves the late-night run of yesterday out', () => {
    const stats = today([
      run('2026-10-16T11:45:00.000Z', 2),
      run('2026-10-15T18:00:00.000Z', 9),
    ]);

    expect(stats.kpis.spend_usd).toBe(2);
    expect(stats.spend_by_project[0]?.values[17]).toBe(2);
  });

  it('compares with yesterday up to the same time of day', () => {
    const stats = today([
      run('2026-10-16T11:45:00.000Z', 3),
      run('2026-10-15T11:00:00.000Z', 1),
      run('2026-10-15T12:30:00.000Z', 50),
    ]);

    expect(stats.kpis.spend_prev_usd).toBe(1);
  });

  it('reads runs back to the start of yesterday', () => {
    expect(overviewRunsSince('today', NOW, 330)).toBe('2026-10-01T00:00:00.000Z');
    // On the 1st of a month, yesterday starts before the month does.
    expect(overviewRunsSince('today', Date.parse('2026-11-01T12:00:00.000Z'), 330)).toBe(
      '2026-10-30T18:30:00.000Z',
    );
  });
});

describe('overviewRunsSince', () => {
  it('reaches back to the start of the previous period or the month, whichever is earlier', () => {
    expect(overviewRunsSince('7d', NOW)).toBe('2026-10-01T00:00:00.000Z');
    expect(overviewRunsSince('90d', NOW)).toBe('2026-04-20T00:00:00.000Z');
  });

  it('has no lower bound for all time', () => {
    expect(overviewRunsSince('all', NOW)).toBeUndefined();
  });
});

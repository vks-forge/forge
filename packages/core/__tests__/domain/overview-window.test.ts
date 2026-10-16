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

describe('overviewRunsSince', () => {
  it('reaches back to the start of the previous period or the month, whichever is earlier', () => {
    expect(overviewRunsSince('7d', NOW)).toBe('2026-10-01T00:00:00.000Z');
    expect(overviewRunsSince('90d', NOW)).toBe('2026-04-20T00:00:00.000Z');
  });

  it('has no lower bound for all time', () => {
    expect(overviewRunsSince('all', NOW)).toBeUndefined();
  });
});

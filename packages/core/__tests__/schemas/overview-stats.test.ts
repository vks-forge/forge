/**
 * Pins the Overview response schema and the range words it shares with Home and Cost.
 *
 * Why: the server builds `OverviewStats` and the web parses it with the same schema, so a
 *   drifting field must fail loudly at the boundary. The range list also grew to 12 months and
 *   all time; per-project endpoints share it and must keep default and rejection behaviour.
 *
 * Pins: computed stats parse, a misaligned series is not silently accepted by the compute
 *   output, StatsRangeQuery accepts 12m and all and rejects others, defaultGroup() per range.
 * Depends on: src/domain/overview-stats, src/schemas/overview-stats, src/schemas/stats-range. No IO.
 */

import { describe, expect, it } from 'vitest';
import { computeOverviewStats } from '#/domain/overview-stats.js';
import { OverviewQuery, OverviewStats } from '#/schemas/overview-stats.js';
import { StatsRangeQuery, defaultGroup } from '#/schemas/stats-range.js';

describe('OverviewStats', () => {
  it('parses what computeOverviewStats returns, and every series matches the buckets', () => {
    const stats = computeOverviewStats({
      range: '90d',
      group: 'week',
      nowMs: Date.parse('2026-10-16T12:00:00.000Z'),
      projects: [
        {
          slug: 'a',
          status: 'ready',
          tickets: [],
          runs: [],
          gates: [],
          activeRuns: 0,
          openCards: 0,
          needsAction: [],
        },
      ],
      unknown: ['ghost'],
    });

    const parsed = OverviewStats.parse(stats);

    expect(parsed.unknown).toEqual(['ghost']);
    for (const series of [
      parsed.tickets_done,
      parsed.tickets_started,
      parsed.runs_passed,
      parsed.runs_failed,
      parsed.runs_interrupted,
      parsed.spend_by_project[0]?.values ?? [],
    ]) {
      expect(series).toHaveLength(parsed.buckets.length);
    }
  });
});

describe('stats ranges', () => {
  it('accepts 12m and all and still rejects anything else', () => {
    expect(StatsRangeQuery.parse({ range: '12m' }).range).toBe('12m');
    expect(StatsRangeQuery.parse({ range: 'all' }).range).toBe('all');
    expect(StatsRangeQuery.parse({}).range).toBe('30d');
    expect(StatsRangeQuery.safeParse({ range: '1y' }).success).toBe(false);
  });

  it('follows the range for the default grouping', () => {
    expect(defaultGroup('7d')).toBe('day');
    expect(defaultGroup('30d')).toBe('day');
    expect(defaultGroup('90d')).toBe('week');
    expect(defaultGroup('12m')).toBe('month');
    expect(defaultGroup('all')).toBe('month');
  });

  it('defaults the overview query to 30 days, all projects, archived off', () => {
    expect(OverviewQuery.parse({})).toEqual({
      range: '30d',
      projects: [],
      archived: false,
    });
  });
});

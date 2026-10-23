/**
 * Pins that the Cost report adds the Director's spend to the Workers' and keeps the split.
 *
 * Why: the Cost page showed only what runs recorded ($7.43) while the cards, which add the Director's own
 *   steps, summed to $24.86; the owner could not tell which number to believe. The report now adds both
 *   sources and says how much each was, per day too, so the total of a project is the sum of its cards.
 *
 * Pins: runs $3 plus Director $7 is $10 with worker 3 and director 7; the per-day split adds up to the
 *   per-day total and to the report total; Director rows outside the window are ignored; steps without a
 *   price are counted but add nothing.
 * Depends on: src/domain/cost-report. No IO.
 */

import { describe, expect, it } from 'vitest';
import { computeCostReport } from '#/domain/cost-report.js';
import type { DirectorSpend } from '#/schemas/director-spend.js';
import type { Run } from '#/schemas/run.js';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

const run = (id: string, started_at: string, cost_usd?: number): Run => ({
  id,
  ticket_id: 'SF-1',
  harness: 'claude',
  driver_version: '1',
  cwd: '/w',
  lane: 'express',
  started_at,
  status: 'success',
  owner: 'srv',
  ...(cost_usd === undefined ? {} : { cost_usd }),
});

const spend = (id: number, at: string, usd: number, recorded = true): DirectorSpend => ({
  id,
  project: 'sf',
  kind: 'card_chat',
  usd,
  recorded,
  at,
});

const base = {
  project: 'sf',
  range: '7d' as const,
  nowMs: NOW,
  titles: new Map<string, string>(),
  budgets: { run_max_usd: 5, step_budget_usd: 1 },
};

describe('computeCostReport with Director spend', () => {
  it('adds Workers and Director into one total and reports each', () => {
    const r = computeCostReport({
      ...base,
      runs: [run('a', '2026-10-15T01:00:00.000Z', 3)],
      directorSpend: [
        spend(1, '2026-10-15T02:00:00.000Z', 4),
        spend(2, '2026-10-16T02:00:00.000Z', 3),
      ],
    });

    expect(r.total_usd).toBe(10);
    expect(r.worker_usd).toBe(3);
    expect(r.director_usd).toBe(7);
    expect(r.director_steps_total).toBe(2);
    expect(r.director_steps_recorded).toBe(2);
  });

  it('splits every day so the two sources add up to the day and to the total', () => {
    const r = computeCostReport({
      ...base,
      runs: [run('a', '2026-10-15T01:00:00.000Z', 3)],
      directorSpend: [
        spend(1, '2026-10-15T02:00:00.000Z', 4),
        spend(2, '2026-10-16T02:00:00.000Z', 3),
      ],
    });

    const day = r.per_day_split.find((d) => d.date === '2026-10-15');
    expect(day).toEqual({ date: '2026-10-15', worker_usd: 3, director_usd: 4 });
    for (const [i, point] of r.per_day.entries()) {
      const split = r.per_day_split[i];
      expect(split?.date).toBe(point.date);
      expect((split?.worker_usd ?? 0) + (split?.director_usd ?? 0)).toBeCloseTo(
        point.value,
      );
    }

    expect(r.per_day.reduce((sum, p) => sum + p.value, 0)).toBeCloseTo(r.total_usd);
  });

  it('ignores Director rows dated outside the window and counts unpriced steps without dollars', () => {
    const r = computeCostReport({
      ...base,
      runs: [],
      directorSpend: [
        spend(1, '2026-09-01T00:00:00.000Z', 50),
        spend(2, '2026-10-15T02:00:00.000Z', 0, false),
      ],
    });

    expect(r.director_usd).toBe(0);
    expect(r.director_steps_total).toBe(1);
    expect(r.director_steps_recorded).toBe(0);
  });
});

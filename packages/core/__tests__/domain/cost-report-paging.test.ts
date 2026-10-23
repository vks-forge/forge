/**
 * Cost report paging: "Top tickets" and "Top runs" are pages, not a fixed top 50.
 *
 * Why: the Cost page pages its two ranked tables from the server. The first page must stay
 *   what the report always returned (top 50, same order) so older clients are unaffected,
 *   later pages must continue the same ranking without repeats, and the totals must say how
 *   many rows exist so the page can show "51-100 of 230".
 *
 * Pins: default page equals the old top 50; limit and offset slice the same ranking; totals
 *   count every row of the window, not the page; an offset past the end is an empty page.
 * Depends on: src/domain/cost-report.
 */

import { describe, expect, it } from 'vitest';
import { computeCostReport } from '#/domain/cost-report.js';
import type { Run } from '#/schemas/run.js';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

const runs: Run[] = Array.from({ length: 120 }, (_, i) => ({
  id: `r${String(i).padStart(3, '0')}`,
  ticket_id: `SF-${i}`,
  harness: 'claude',
  driver_version: '1',
  cwd: '/w',
  lane: 'express',
  started_at: '2026-10-15T00:00:00.000Z',
  status: 'success',
  owner: 'srv',
  cost_usd: i + 1,
}));

const input = {
  project: 'p',
  range: '7d' as const,
  nowMs: NOW,
  runs,
  directorSpend: [],
  titles: new Map<string, string>(),
  budgets: { run_max_usd: 5, step_budget_usd: 1 },
};

describe('computeCostReport paging', () => {
  it('returns the top 50 by default and reports the full totals', () => {
    const r = computeCostReport(input);

    expect(r.by_ticket).toHaveLength(50);
    expect(r.by_run).toHaveLength(50);
    expect(r.by_ticket[0]?.ticket_id).toBe('SF-119');
    expect(r.by_ticket_total).toBe(120);
    expect(r.by_run_total).toBe(120);
  });

  it('continues the same ranking with offset, independently for tickets and runs', () => {
    const first = computeCostReport(input);
    const next = computeCostReport({
      ...input,
      page: { ticket: { limit: 50, offset: 50 }, run: { limit: 10, offset: 5 } },
    });

    expect(next.by_ticket).toHaveLength(50);
    expect(next.by_ticket[0]?.ticket_id).toBe('SF-69');
    expect(next.by_run).toHaveLength(10);
    expect(next.by_run[0]?.run_id).toBe(first.by_run[5]?.run_id);
  });

  it('gives a short last page and an empty page past the end', () => {
    const last = computeCostReport({
      ...input,
      page: { ticket: { limit: 50, offset: 100 }, run: { limit: 50, offset: 500 } },
    });

    expect(last.by_ticket).toHaveLength(20);
    expect(last.by_run).toEqual([]);
    expect(last.by_run_total).toBe(120);
  });
});

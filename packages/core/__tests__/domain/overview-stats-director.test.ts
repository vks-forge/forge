/**
 * Pins that the Overview counts Director spend, dated, beside Workers' spend.
 *
 * Why: the Overview showed only run cost, so a project whose money went mostly into Director planning
 *   looked cheap. Director rows carry the day they happened, so they land in the right bucket and the
 *   right project, count in the range, the previous period and the month like run cost, and the split is
 *   always shown.
 *
 * Pins: spend in range and by project include Director rows dated in range and exclude rows outside it;
 *   each project's series and slice carry their own Director part; the by-source series add up to the
 *   total; coverage counts Director steps.
 * Depends on: src/domain/overview-stats. No IO.
 */

import { describe, expect, it } from 'vitest';
import { computeOverviewStats } from '#/domain/overview-stats.js';
import type { DirectorSpend } from '#/schemas/director-spend.js';
import type { Run } from '#/schemas/run.js';
import type { OverviewProjectInput } from '#/types/overview-stats-input.types.js';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

const run = (id: string, cost_usd: number): Run => ({
  id,
  ticket_id: 'SF-1',
  harness: 'claude',
  driver_version: '1',
  cwd: '/x',
  lane: 'express',
  started_at: '2026-10-16T01:00:00.000Z',
  status: 'success',
  owner: 'o',
  cost_usd,
});

const spend = (id: number, at: string, usd: number, recorded = true): DirectorSpend => ({
  id,
  project: 'a',
  kind: 'card_chat',
  usd,
  recorded,
  at,
});

const project = (
  slug: string,
  over: Partial<OverviewProjectInput> = {},
): OverviewProjectInput => ({
  slug,
  status: 'ready',
  tickets: [],
  runs: [],
  directorSpend: [],
  gates: [],
  activeRuns: 0,
  openCards: 0,
  needsAction: [],
  ...over,
});

const compute = (projects: OverviewProjectInput[]) =>
  computeOverviewStats({ range: '7d', group: 'day', nowMs: NOW, projects, unknown: [] });

const total = (values: readonly number[] | undefined): number =>
  (values ?? []).reduce((x, y) => x + y, 0);

describe('computeOverviewStats with Director spend', () => {
  it('adds Director rows dated in range to the spend and drops rows outside it', () => {
    const s = compute([
      project('a', {
        runs: [run('r1', 2)],
        directorSpend: [
          spend(1, '2026-10-15T03:00:00.000Z', 5),
          spend(2, '2026-08-01T03:00:00.000Z', 100),
        ],
      }),
    ]);

    expect(s.kpis.spend_usd).toBe(7);
    expect(s.kpis.spend_worker_usd).toBe(2);
    expect(s.kpis.spend_director_usd).toBe(5);
    expect(s.projects[0]).toMatchObject({ spend_usd: 7, director_usd: 5 });
    expect(s.spend_by_project_total).toEqual([
      { key: 'a', usd: 7, worker_usd: 2, director_usd: 5 },
    ]);
  });

  it('keeps each project own Director spend in its own series and slice', () => {
    const s = compute([
      project('a', { directorSpend: [spend(1, '2026-10-15T03:00:00.000Z', 5)] }),
      project('b', { runs: [run('r1', 1)] }),
    ]);

    const a = s.spend_by_project.find((p) => p.project === 'a');
    const b = s.spend_by_project.find((p) => p.project === 'b');
    expect(total(a?.values)).toBe(5);
    expect(total(a?.director_values)).toBe(5);
    expect(total(b?.director_values)).toBe(0);
  });

  it('splits the spend over time by source and the two add up to the total', () => {
    const s = compute([
      project('a', {
        runs: [run('r1', 2)],
        directorSpend: [spend(1, '2026-10-16T03:00:00.000Z', 5)],
      }),
    ]);

    const sum = (source: string) =>
      total(s.spend_by_source.find((x) => x.source === source)?.values);

    expect(sum('worker')).toBe(2);
    expect(sum('director')).toBe(5);
    expect(sum('worker') + sum('director')).toBe(s.kpis.spend_usd);
  });

  it('counts Director steps and the priced ones in the coverage', () => {
    const s = compute([
      project('a', {
        directorSpend: [
          spend(1, '2026-10-16T03:00:00.000Z', 1),
          spend(2, '2026-10-16T04:00:00.000Z', 0, false),
        ],
      }),
    ]);

    expect(s.cost_coverage).toMatchObject({
      director_steps: 2,
      director_steps_recorded: 1,
    });
  });
});

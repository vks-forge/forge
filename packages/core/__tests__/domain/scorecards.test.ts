/**
 * Pins the arithmetic of agent and pipeline-shape scorecards.
 *
 * Why: the owner reads these numbers to decide whom to trust with a stage, and the Director reads them to
 *   pick a substitute (d-0081). A figure with no data must be null, never a flattering zero; a run with no
 *   recorded cost must widen the coverage gap, never be priced by guess; a row built on fewer than five
 *   tickets must say so; the owner's mark on a finding must beat any verdict the engine derives; and the
 *   window must include its first instant and exclude what is older. Nothing here is stored or applied.
 *
 * Pins: no data reads null, the writer figures (clean rate, reworks, cost coverage, durations, fallback runs and
 *   substitutes), the window's first instant and the slices by type, tier and lane.
 * Depends on: src/domain/scorecards, tests/helpers/scorecard-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { compactScorecards, computeScorecards } from '#/domain/scorecards.js';
import {
  DAY,
  HASH2,
  agentRow,
  input,
  iso,
  row,
  run,
  snapshot,
  ticket,
} from '#tests/helpers/scorecard-fixtures.js';

describe('computeScorecards: no data', () => {
  it('reads null, not zero, for an agent that took part in nothing', () => {
    const r = agentRow(computeScorecards(input()), 'implementer');

    expect(r).toMatchObject({
      tickets: 0,
      runs: 0,
      insufficient: true,
      clean_rate: null,
      pass_rate: null,
      reworks_per_ticket: null,
      cost: {
        total_usd: 0,
        per_ticket_usd: null,
        coverage: { hits: 0, total: 0, rate: null },
      },
      duration: { count: 0, median_ms: null, p90_ms: null },
    });
  });
});

describe('computeScorecards: writers', () => {
  const six = [1, 2, 3, 4, 5, 6];
  const base = (reworks: number[]) =>
    input({
      tickets: six.map((n, i) => ticket(n, { rework_count: reworks[i] ?? 0 })),
      snapshots: six.map((n) => snapshot(n)),
      rows: six.map((n) => row(n, 'implementer', 'implementer')),
      runs: six.map((n) => run(n, 'implementer')),
    });

  it('clean rate is finished tickets with no rework over finished tickets it took part in', () => {
    const r = agentRow(computeScorecards(base([0, 0, 1, 0, 2, 0])), 'implementer');

    expect(r?.tickets).toBe(6);
    expect(r?.insufficient).toBe(false);
    expect(r?.clean_rate).toEqual({ hits: 4, total: 6, rate: 4 / 6 });
    expect(r?.reworks_per_ticket).toBeCloseTo(0.5);
    expect(r?.pass_rate).toBeNull();
  });

  it('fewer than five tickets is insufficient', () => {
    const small = input({
      tickets: [1, 2, 3, 4].map((n) => ticket(n)),
      snapshots: [1, 2, 3, 4].map((n) => snapshot(n)),
      rows: [1, 2, 3, 4].map((n) => row(n, 'implementer', 'implementer')),
    });

    expect(agentRow(computeScorecards(small), 'implementer')?.insufficient).toBe(true);
  });

  it('counts an open ticket as taking part but not as finished', () => {
    const r = agentRow(
      computeScorecards(
        input({
          tickets: [ticket(1), ticket(2, { status: 'in_progress' })],
          snapshots: [snapshot(1), snapshot(2)],
          rows: [
            row(1, 'implementer', 'implementer'),
            row(2, 'implementer', 'implementer', { status: 'running' }),
          ],
        }),
      ),
      'implementer',
    );

    expect(r?.tickets).toBe(2);
    expect(r?.clean_rate).toEqual({ hits: 1, total: 1, rate: 1 });
  });

  it('adds cost only from runs that recorded it and reports the coverage', () => {
    const r = agentRow(
      computeScorecards(
        input({
          tickets: [ticket(1), ticket(2)],
          snapshots: [snapshot(1), snapshot(2)],
          rows: [
            row(1, 'implementer', 'implementer'),
            row(2, 'implementer', 'implementer'),
          ],
          runs: [run(1, 'implementer', { cost_usd: 0.5 }), run(2, 'implementer')],
        }),
      ),
      'implementer',
    );

    expect(r?.cost.total_usd).toBe(0.5);
    expect(r?.cost.coverage).toEqual({ hits: 1, total: 2, rate: 0.5 });
    expect(r?.cost.per_ticket_usd).toBe(0.25);
    expect(r?.runs).toBe(2);
    expect(r?.duration).toMatchObject({ count: 2, median_ms: 120_000 });
  });

  it('cost per ticket is null when no run recorded a cost', () => {
    const r = agentRow(computeScorecards(base([0, 0, 0, 0, 0, 0])), 'implementer');

    expect(r?.cost.per_ticket_usd).toBeNull();
  });

  it('counts fallback runs and the tickets a substitute took over', () => {
    const swapped = snapshot(2, {
      adjustments: [
        {
          seq: 0,
          op: {
            op: 'swap',
            stage_id: 'implementer',
            agent: 'frontend-writer',
            reason: 'the first agent was gone',
          },
          by: 'director',
          cause: 'fallback',
          key: 'standard:swap:implementer:frontend-writer',
          status: 'applied',
          at: iso(DAY),
        },
      ],
      hash: HASH2,
    });

    const reply = computeScorecards(
      input({
        tickets: [ticket(1), ticket(2)],
        snapshots: [snapshot(1), swapped],
        rows: [
          row(1, 'implementer', 'implementer'),
          row(2, 'implementer', 'frontend-writer'),
        ],
        runs: [
          run(1, 'implementer', { fallback_slot: 1 }),
          run(2, 'frontend-writer', { fallback_slot: -1 }),
        ],
      }),
    );

    expect(agentRow(reply, 'implementer')?.fallback_runs).toBe(1);
    expect(agentRow(reply, 'frontend-writer')?.substituted).toBe(1);
    expect(agentRow(reply, 'frontend-writer')?.fallback_runs).toBe(1);
  });
});

describe('computeScorecards: window', () => {
  it('includes a ticket updated at the first instant and excludes an older one', () => {
    const r = agentRow(
      computeScorecards(
        input({
          range: '30d',
          tickets: [
            ticket(1, { updated_at: iso(30 * DAY) }),
            ticket(2, { updated_at: iso(30 * DAY + 1) }),
          ],
          snapshots: [snapshot(1), snapshot(2)],
          rows: [
            row(1, 'implementer', 'implementer'),
            row(2, 'implementer', 'implementer'),
          ],
        }),
      ),
      'implementer',
    );

    expect(r?.tickets).toBe(1);
  });
});

describe('computeScorecards: slices', () => {
  it('cuts rows by type, tier and lane', () => {
    const reply = computeScorecards(
      input({
        tickets: [
          ticket(1),
          ticket(2, { type: 'fix', tier_predicted: 'B', tier_actual: 'C', lane: 'full' }),
        ],
        snapshots: [snapshot(1), snapshot(2, { lane: 'full' })],
        rows: [
          row(1, 'implementer', 'implementer'),
          row(2, 'implementer', 'implementer'),
        ],
      }),
    );

    expect(agentRow(reply, 'implementer', 'type', 'feat')?.tickets).toBe(1);
    expect(agentRow(reply, 'implementer', 'type', 'fix')?.tickets).toBe(1);
    expect(agentRow(reply, 'implementer', 'tier', 'C')?.tickets).toBe(1);
    expect(agentRow(reply, 'implementer', 'lane', 'full')?.tickets).toBe(1);
    expect(agentRow(reply, 'implementer', 'lane', 'express')).toBeUndefined();
  });

  it('compactScorecards keeps the all row and the asked types, and drops agents with no tickets', () => {
    const reply = computeScorecards(
      input({
        tickets: [ticket(1), ticket(2, { type: 'fix' })],
        snapshots: [snapshot(1), snapshot(2)],
        rows: [
          row(1, 'implementer', 'implementer'),
          row(2, 'implementer', 'implementer'),
        ],
      }),
    );

    const compact = compactScorecards(reply, ['fix']);

    expect(compact.map((a) => a.agent_id)).toEqual(['implementer']);
    expect(compact[0]?.rows.map((r) => `${r.by}:${r.value ?? ''}`)).toEqual([
      'all:',
      'type:fix',
    ]);
  });
});

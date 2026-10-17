/**
 * Cost rollups: what a ticket's runs and a card's work cost, in dollars.
 *
 * Why: the ticket and card pages show spend next to the work. The sums must count only what
 *   was recorded (a run with no cost is zero and says so, never a guess), and a card's total
 *   must be exactly its Director spend plus its tickets' runs, so the split on screen can
 *   never disagree with the headline figure.
 *
 * Pins: ticket total and per-run rows (recorded flag, oldest first); card split and total;
 *   per-ticket rows highest first with stable ties; empty inputs are zero.
 * Depends on: src/domain/cost-rollup.
 */

import { describe, expect, it } from 'vitest';
import { rollupCardCost, rollupTicketCost } from '#/domain/cost-rollup.js';
import type { Run } from '#/schemas/run.js';

const run = (id: string, over: Partial<Run> = {}): Run => ({
  id,
  ticket_id: 'SF-1',
  harness: 'claude',
  driver_version: '1',
  cwd: '/w',
  lane: 'express',
  started_at: '2026-10-15T00:00:00.000Z',
  status: 'success',
  owner: 'srv',
  ...over,
});

describe('rollupTicketCost', () => {
  it('sums recorded cost and flags runs that recorded none', () => {
    const cost = rollupTicketCost([
      run('a', { cost_usd: 0.5 }),
      run('b', { started_at: '2026-10-15T01:00:00.000Z' }),
      run('c', { cost_usd: 0, started_at: '2026-10-15T02:00:00.000Z' }),
    ]);

    expect(cost.total_usd).toBeCloseTo(0.5);
    expect(cost.by_run).toEqual([
      {
        run_id: 'a',
        usd: 0.5,
        status: 'success',
        started_at: run('a').started_at,
        recorded: true,
      },
      {
        run_id: 'b',
        usd: 0,
        status: 'success',
        started_at: '2026-10-15T01:00:00.000Z',
        recorded: false,
      },
      {
        run_id: 'c',
        usd: 0,
        status: 'success',
        started_at: '2026-10-15T02:00:00.000Z',
        recorded: true,
      },
    ]);
  });

  it('is zero with no runs', () => {
    expect(rollupTicketCost([])).toEqual({ total_usd: 0, by_run: [] });
  });
});

describe('rollupCardCost', () => {
  it('splits Director and ticket spend and totals them', () => {
    const cost = rollupCardCost({
      directorUsd: 0.4,
      tickets: [
        { id: 'SF-1', title: 'one' },
        { id: 'SF-2', title: 'two' },
        { id: 'SF-3', title: 'three' },
      ],
      costByTicket: { 'SF-1': 0.1, 'SF-2': 0.3 },
    });

    expect(cost.director_usd).toBeCloseTo(0.4);
    expect(cost.tickets_usd).toBeCloseTo(0.4);
    expect(cost.total_usd).toBeCloseTo(0.8);
    expect(cost.by_ticket).toEqual([
      { ticket_id: 'SF-2', title: 'two', usd: 0.3 },
      { ticket_id: 'SF-1', title: 'one', usd: 0.1 },
      { ticket_id: 'SF-3', title: 'three', usd: 0 },
    ]);
  });

  it('is all zeros for a card with no work yet', () => {
    expect(rollupCardCost({ directorUsd: 0, tickets: [], costByTicket: {} })).toEqual({
      director_usd: 0,
      tickets_usd: 0,
      total_usd: 0,
      by_ticket: [],
    });
  });
});

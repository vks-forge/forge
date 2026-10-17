/**
 * Contract cases for `runs.costByTicket` and `runs.costByCard`: grouped run cost.
 *
 * Why: card and ticket rows on the Board and the Tickets page show what they cost. Summing in
 *   one grouped query keeps those lists cheap, but only if every backend adds the same
 *   things: all runs of a ticket (retries and reworks included), only recorded cost (a run
 *   with none adds nothing and a ticket with none is absent), and a card's figure is exactly
 *   its own tickets' runs, never another card's or another ticket's.
 *
 * Exports: describeRunCostContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { CardId, StorageAdapter, Ticket } from '@forge/core';
import { makeRun, makeTicket } from '#tests/helpers/fixtures.js';

const card = (n: number) => `SF-C${n}` as CardId;

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeRunCostContract(getDb: () => StorageAdapter): void {
  const seed = () =>
    getDb().transaction(async (tx) => {
      await tx.tickets.insert(makeTicket(1, { card_id: card(1) }));
      await tx.tickets.insert(makeTicket(2, { card_id: card(1) }));
      await tx.tickets.insert(makeTicket(3, { card_id: card(2) }));
      await tx.tickets.insert(makeTicket(4, { id: 'SF-4' as Ticket['id'] }));
      await tx.runs.insert(makeRun('a', { ticket_id: 'SF-1', cost_usd: 0.5 }));
      await tx.runs.insert(makeRun('b', { ticket_id: 'SF-1', cost_usd: 0.25 }));
      await tx.runs.insert(makeRun('c', { ticket_id: 'SF-1' }));
      await tx.runs.insert(makeRun('d', { ticket_id: 'SF-2', cost_usd: 1 }));
      await tx.runs.insert(makeRun('e', { ticket_id: 'SF-3', cost_usd: 4 }));
      await tx.runs.insert(makeRun('f', { ticket_id: 'SF-4' }));
    });

  describe('runs.costByTicket', () => {
    it('sums recorded cost per ticket and leaves out tickets with none', async () => {
      await seed();

      const got = await getDb().transaction((tx) =>
        tx.runs.costByTicket(['SF-1', 'SF-2', 'SF-3', 'SF-4', 'SF-9']),
      );

      expect(got).toEqual({ 'SF-1': 0.75, 'SF-2': 1, 'SF-3': 4 });
    });

    it('answers only for the ids asked and handles an empty list', async () => {
      await seed();

      expect(await getDb().transaction((tx) => tx.runs.costByTicket(['SF-2']))).toEqual({
        'SF-2': 1,
      });

      expect(await getDb().transaction((tx) => tx.runs.costByTicket([]))).toEqual({});
    });
  });

  describe('runs.costByCard', () => {
    it('sums the runs of each card tickets and keeps cards apart', async () => {
      await seed();

      const got = await getDb().transaction((tx) =>
        tx.runs.costByCard([card(1), card(2), card(3)]),
      );

      expect(got).toEqual({ [card(1)]: 1.75, [card(2)]: 4 });
    });

    it('answers only for the cards asked and handles an empty list', async () => {
      await seed();

      expect(await getDb().transaction((tx) => tx.runs.costByCard([card(2)]))).toEqual({
        [card(2)]: 4,
      });

      expect(await getDb().transaction((tx) => tx.runs.costByCard([]))).toEqual({});
    });
  });
}

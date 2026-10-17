/**
 * Contract cases for `tickets.listByProject`: the project-scoped, paged ticket list.
 *
 * Why: the web Board pages through one project's tickets. If a backend ordered ties
 * differently, let another project's rows through, or applied the cursor inclusively, a
 * card would repeat, vanish between pages or show under the wrong project. These cases pin
 * the total order (`updated_at` desc, then `id` desc), the exclusive cursor, the status
 * filter and project isolation on every backend. The Tickets page adds lane, card and text
 * filters, created and cost orders, offset paging and an exact match count; those must agree
 * between backends too, or the page would show a different list per database.
 *
 * Exports: describeTicketListContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type {
  CardId,
  StorageAdapter,
  Ticket,
  TicketListFilter,
  TicketListKey,
  TicketMatch,
} from '@forge/core';
import { makeRun, makeTicket } from '#tests/helpers/fixtures.js';

const at = (minute: number): string =>
  `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeTicketListContract(getDb: () => StorageAdapter): void {
  const seed = (tickets: Ticket[]) =>
    getDb().transaction(async (tx) => {
      for (const t of tickets) {
        await tx.tickets.insert(t);
      }
    });

  const list = (project: string, filter: Partial<TicketListFilter>) =>
    getDb().transaction((tx) =>
      tx.tickets.listByProject(project, { limit: 100, ...filter }),
    );

  describe('tickets.listByProject', () => {
    it('orders by updated_at descending with id descending as the tie-break', async () => {
      await seed([
        makeTicket(1, { updated_at: at(1) }),
        makeTicket(2, { updated_at: at(5) }),
        makeTicket(3, { updated_at: at(5) }),
        makeTicket(4, { updated_at: at(3) }),
      ]);

      const got = await list('SF', {});

      expect(got.map((t) => t.id)).toEqual([
        makeTicket(3).id,
        makeTicket(2).id,
        makeTicket(4).id,
        makeTicket(1).id,
      ]);
    });

    it('never returns another project, even with a status filter', async () => {
      await seed([
        makeTicket(1),
        makeTicket(2, { project: 'OTHER', id: 'OT-1' as Ticket['id'] }),
      ]);

      const all = await list('SF', {});
      const filtered = await list('SF', { statuses: ['inbox'] });

      expect(all.map((t) => t.id)).toEqual([makeTicket(1).id]);
      expect(filtered.map((t) => t.id)).toEqual([makeTicket(1).id]);
    });

    it('keeps only the requested statuses, and treats an empty list as no filter', async () => {
      await seed([
        makeTicket(1, { status: 'inbox' }),
        makeTicket(2, { status: 'planned' }),
        makeTicket(3, { status: 'done' }),
      ]);

      const two = await list('SF', { statuses: ['planned', 'done'] });
      const none = await list('SF', { statuses: [] });

      expect(two.map((t) => t.status).sort()).toEqual(['done', 'planned']);
      expect(none).toHaveLength(3);
    });

    it('pages with an exclusive cursor: no repeats, no gaps, ties included', async () => {
      await seed(
        [1, 2, 3, 4, 5, 6, 7].map((n) => makeTicket(n, { updated_at: at(n % 3) })),
      );

      const everything = await list('SF', {});
      const seen: Ticket[] = [];
      let after: TicketListKey | undefined;
      for (let page = 0; page < 10; page += 1) {
        const rows = await list('SF', { limit: 2, ...(after ? { after } : {}) });
        if (rows.length === 0) {
          break;
        }

        seen.push(...rows);
        const last = rows[rows.length - 1] as Ticket;
        after = { updated_at: last.updated_at, id: last.id };
      }

      expect(seen.map((t) => t.id)).toEqual(everything.map((t) => t.id));
      expect(new Set(seen.map((t) => t.id)).size).toBe(7);
    });

    it('caps the page at the limit and reads blockers like get()', async () => {
      await seed([
        makeTicket(1, { updated_at: at(1) }),
        makeTicket(2, { updated_at: at(2), blocked_by: [makeTicket(1).id] }),
      ]);

      const one = await list('SF', { limit: 1 });

      expect(one).toHaveLength(1);
      expect(one[0]?.blocked_by).toEqual([makeTicket(1).id]);
    });
  });

  describe('tickets.listByProject filters, sorts and counts', () => {
    const ids = (rows: Ticket[]) => rows.map((t) => t.id);

    it('filters by lane and by card', async () => {
      await seed([
        makeTicket(1, { lane: 'express', card_id: 'SF-C1' as CardId }),
        makeTicket(2, { lane: 'standard', card_id: 'SF-C1' as CardId }),
        makeTicket(3, { lane: 'express', card_id: 'SF-C2' as CardId }),
      ]);

      expect(ids(await list('SF', { lane: 'express' })).sort()).toEqual(['SF-1', 'SF-3']);
      expect(ids(await list('SF', { card_id: 'SF-C1' as CardId })).sort()).toEqual([
        'SF-1',
        'SF-2',
      ]);
    });

    it('searches id and title case-insensitively and treats % and _ literally', async () => {
      await seed([
        makeTicket(1, { title: 'Fix Login redirect' }),
        makeTicket(2, { title: '100% coverage' }),
        makeTicket(3, { title: 'plain_name' }),
        makeTicket(4, { title: 'plainXname' }),
      ]);

      expect(ids(await list('SF', { search: 'login' }))).toEqual(['SF-1']);
      expect(ids(await list('SF', { search: 'sf-2' }))).toEqual(['SF-2']);
      expect(ids(await list('SF', { search: '%' }))).toEqual(['SF-2']);
      expect(ids(await list('SF', { search: 'plain_' }))).toEqual(['SF-3']);
    });

    it('sorts by created_at descending and by summed run cost descending', async () => {
      await seed([
        makeTicket(1, { created_at: at(1), updated_at: at(9) }),
        makeTicket(2, { created_at: at(3), updated_at: at(1) }),
        makeTicket(3, { created_at: at(2), updated_at: at(5) }),
      ]);

      await getDb().transaction(async (tx) => {
        await tx.runs.insert(makeRun('a', { ticket_id: 'SF-1', cost_usd: 0.5 }));
        await tx.runs.insert(makeRun('b', { ticket_id: 'SF-1', cost_usd: 0.75 }));
        await tx.runs.insert(makeRun('c', { ticket_id: 'SF-3', cost_usd: 2 }));
        await tx.runs.insert(makeRun('d', { ticket_id: 'SF-2' }));
      });

      expect(ids(await list('SF', { sort: 'created' }))).toEqual([
        'SF-2',
        'SF-3',
        'SF-1',
      ]);

      expect(ids(await list('SF', { sort: 'cost' }))).toEqual(['SF-3', 'SF-1', 'SF-2']);
    });

    it('pages any order by offset without repeats and counts the matches', async () => {
      await seed(
        [1, 2, 3, 4, 5].map((n) => makeTicket(n, { status: n % 2 ? 'inbox' : 'done' })),
      );

      const first = await list('SF', { sort: 'cost', limit: 2, offset: 0 });
      const second = await list('SF', { sort: 'cost', limit: 2, offset: 2 });
      const past = await list('SF', { sort: 'cost', limit: 2, offset: 9 });
      const count = (match: TicketMatch) =>
        getDb().transaction((tx) => tx.tickets.countByProject('SF', match));

      expect(new Set([...ids(first), ...ids(second)]).size).toBe(4);
      expect(past).toEqual([]);
      expect(await count({})).toBe(5);
      expect(await count({ statuses: ['done'] })).toBe(2);
      expect(await count({ search: 'ticket 3' })).toBe(1);
    });

    it('counts only the asked project', async () => {
      await seed([
        makeTicket(1),
        makeTicket(2, { project: 'OTHER', id: 'OT-1' as Ticket['id'] }),
      ]);

      expect(await getDb().transaction((tx) => tx.tickets.countByProject('SF', {}))).toBe(
        1,
      );

      expect(
        await getDb().transaction((tx) => tx.tickets.countByProject('NONE', {})),
      ).toBe(0);
    });
  });
}

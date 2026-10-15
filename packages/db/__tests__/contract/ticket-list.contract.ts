/**
 * Contract cases for `tickets.listByProject`: the project-scoped, paged ticket list.
 *
 * Why: the web Board pages through one project's tickets. If a backend ordered ties
 * differently, let another project's rows through, or applied the cursor inclusively, a
 * card would repeat, vanish between pages or show under the wrong project. These cases pin
 * the total order (`updated_at` desc, then `id` desc), the exclusive cursor, the status
 * filter and project isolation on every backend.
 *
 * Exports: describeTicketListContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type {
  StorageAdapter,
  Ticket,
  TicketListFilter,
  TicketListKey,
} from '@forge/core';
import { makeTicket } from '#tests/helpers/fixtures.js';

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
}

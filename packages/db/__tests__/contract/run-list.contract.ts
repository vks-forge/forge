/**
 * Contract cases for `runs.list`: the project-scoped, filtered, paged run list.
 *
 * Why: the Runs screen, the Home stats and the Cost report all read runs through this one
 *   query. A backend that attributed a run to the wrong project, ordered ties differently,
 *   applied the cursor inclusively or ignored the `since` bound would show another team's
 *   spend, repeat or skip a row between pages, or count runs outside the chosen window.
 *
 * Exports: describeRunListContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { RunListFilter, StorageAdapter, Ticket } from '@forge/core';
import { makeRun, makeTicket } from '#tests/helpers/fixtures.js';

const at = (minute: number): string =>
  `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeRunListContract(getDb: () => StorageAdapter): void {
  const seed = async () => {
    await getDb().transaction(async (tx) => {
      await tx.tickets.insert(makeTicket(1));
      await tx.tickets.insert(
        makeTicket(2, { project: 'OTHER', id: 'OT-1' as Ticket['id'] }),
      );

      await tx.runs.insert(makeRun('a', { ticket_id: 'SF-1', started_at: at(1) }));
      await tx.runs.insert(
        makeRun('b', { ticket_id: 'SF-1', started_at: at(5), status: 'success' }),
      );

      await tx.runs.insert(makeRun('c', { ticket_id: 'SF-1', started_at: at(5) }));
      await tx.runs.insert(makeRun('d', { ticket_id: 'OT-1', started_at: at(9) }));
    });
  };

  const list = (filter: Partial<RunListFilter>) =>
    getDb().transaction((tx) => tx.runs.list({ limit: 100, ...filter }));

  describe('runs.list', () => {
    it('orders by started_at descending with id descending as the tie-break', async () => {
      await seed();

      expect((await list({})).map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
    });

    it('scopes to a project through the ticket and never leaks another project', async () => {
      await seed();

      expect((await list({ project: 'SF' })).map((r) => r.id)).toEqual(['c', 'b', 'a']);
      expect((await list({ project: 'OTHER' })).map((r) => r.id)).toEqual(['d']);
      expect(await list({ project: 'NONE' })).toEqual([]);
    });

    it('filters by status and by the since bound (inclusive)', async () => {
      await seed();

      expect((await list({ statuses: ['success'] })).map((r) => r.id)).toEqual(['b']);
      expect((await list({ since: at(5) })).map((r) => r.id)).toEqual(['d', 'c', 'b']);
    });

    it('pages with an exclusive cursor: no repeats, no gaps, ties included', async () => {
      await seed();

      const seen: string[] = [];
      let after: RunListFilter['after'];
      for (let page = 0; page < 6; page += 1) {
        const rows = await list({ limit: 2, ...(after ? { after } : {}) });
        if (rows.length === 0) {
          break;
        }

        seen.push(...rows.map((r) => r.id));
        const last = rows[rows.length - 1];
        after = { started_at: last?.started_at ?? '', id: last?.id ?? '' };
      }

      expect(seen).toEqual(['d', 'c', 'b', 'a']);
    });
  });
}

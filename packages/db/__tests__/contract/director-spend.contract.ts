/**
 * Contract cases for the Director spend ledger.
 *
 * Why: Cost, Overview and the ticket page add the Director's dated spend to the Workers' by day, project
 *   and ticket, and the card budget reads the card's total. The ledger must therefore be append-only with
 *   ascending ids, return a project's rows in a time window oldest first, keep one project's money out of
 *   another's, sum a card's rows (rows without a card belong to no card), sum tickets in one grouped read,
 *   and refuse a negative amount so a bad step cannot subtract from the total. Both backends are held to
 *   the same answers.
 *
 * Exports: describeDirectorSpendContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { CardId, NewDirectorSpend, StorageAdapter } from '@forge/core';
import { T0, makeProject, makeTicket } from '#tests/helpers/fixtures.js';

const CARD = 'SF-C1' as CardId;
const OTHER = 'SF-C2' as CardId;

const row = (over: Partial<NewDirectorSpend> = {}): NewDirectorSpend => ({
  project: 'sf',
  card_id: CARD,
  kind: 'card_chat',
  model: 'm1',
  usd: 1,
  recorded: true,
  at: T0,
  ...over,
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeDirectorSpendContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  async function seed(): Promise<void> {
    await tx(async (t) => {
      await t.projects.upsert(makeProject('sf', { slug: 'sf' }));
      await t.projects.upsert(makeProject('zz', { slug: 'zz' }));
      for (const id of [CARD, OTHER]) {
        await t.cards.insert({
          id,
          project: 'sf',
          type: 'issue',
          title: 'c',
          summary: 's',
          source: { kind: 'chat', ref: 'm' },
          created_by: { type: 'user', id: 'u1' },
          created_at: T0,
          updated_at: T0,
          phase: 'grilling',
          phase_version: 0,
          needs_you: false,
          priority: 'normal',
          links: [],
        });
      }

      await t.tickets.insert(makeTicket(1, { card_id: CARD }));
      await t.tickets.insert(makeTicket(2));
    });
  }

  describe('directorSpend', () => {
    it('appends rows with ascending ids and reads them back whole', async () => {
      await seed();

      const a = await tx((t) => t.directorSpend.append(row()));
      const b = await tx((t) =>
        t.directorSpend.append(row({ ticket_id: 'SF-1' as never, model: undefined })),
      );

      expect(b.id).toBeGreaterThan(a.id);
      expect(a).toMatchObject({ project: 'sf', card_id: CARD, usd: 1, recorded: true });
      expect(b).toMatchObject({ ticket_id: 'SF-1', recorded: true });
      expect(b).not.toHaveProperty('model');
    });

    it('lists a project rows in a window, oldest first, and keeps projects apart', async () => {
      await seed();
      await tx(async (t) => {
        await t.directorSpend.append(row({ at: '2026-10-10T00:00:00.000Z', usd: 3 }));
        await t.directorSpend.append(row({ at: '2026-10-05T00:00:00.000Z', usd: 2 }));
        await t.directorSpend.append(row({ at: '2026-10-20T00:00:00.000Z', usd: 4 }));
        await t.directorSpend.append(
          row({ project: 'zz', card_id: undefined, at: '2026-10-10T00:00:00.000Z' }),
        );
      });

      const all = await tx((t) => t.directorSpend.listByProject('sf'));
      expect(all.map((r) => r.usd)).toEqual([2, 3, 4]);

      const inside = await tx((t) =>
        t.directorSpend.listByProject('sf', {
          from: '2026-10-06T00:00:00.000Z',
          to: '2026-10-15T00:00:00.000Z',
        }),
      );

      expect(inside.map((r) => r.usd)).toEqual([3]);
    });

    it('sums a card rows and leaves rows with no card out of every card', async () => {
      await seed();
      await tx(async (t) => {
        await t.directorSpend.append(row({ usd: 1.5 }));
        await t.directorSpend.append(row({ usd: 2 }));
        await t.directorSpend.append(row({ card_id: OTHER, usd: 9 }));
        await t.directorSpend.append(
          row({ card_id: undefined, ticket_id: 'SF-2' as never, usd: 7 }),
        );
      });

      expect(await tx((t) => t.directorSpend.totalByCard(CARD))).toBeCloseTo(3.5);
      expect(await tx((t) => t.directorSpend.totalByCard(OTHER))).toBe(9);
      expect(await tx((t) => t.directorSpend.totalByCard('SF-C9' as CardId))).toBe(0);
    });

    it('sums per ticket for the ids asked, including a ticket with no card', async () => {
      await seed();
      await tx(async (t) => {
        await t.directorSpend.append(row({ ticket_id: 'SF-1' as never, usd: 1 }));
        await t.directorSpend.append(row({ ticket_id: 'SF-1' as never, usd: 2 }));
        await t.directorSpend.append(
          row({ card_id: undefined, ticket_id: 'SF-2' as never, usd: 5 }),
        );
      });

      expect(
        await tx((t) => t.directorSpend.totalByTicket(['SF-1', 'SF-2', 'SF-9'])),
      ).toEqual({ 'SF-1': 3, 'SF-2': 5 });

      expect(await tx((t) => t.directorSpend.totalByTicket(['SF-2']))).toEqual({
        'SF-2': 5,
      });

      expect(await tx((t) => t.directorSpend.totalByTicket([]))).toEqual({});
    });

    it('refuses a negative amount and stores nothing', async () => {
      await seed();

      await expect(tx((t) => t.directorSpend.append(row({ usd: -1 })))).rejects.toThrow();
      expect(await tx((t) => t.directorSpend.listByProject('sf'))).toEqual([]);
    });

    it('leaves no row behind when the transaction rolls back', async () => {
      await seed();

      await expect(
        tx(async (t) => {
          await t.directorSpend.append(row());
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await tx((t) => t.directorSpend.listByProject('sf'))).toEqual([]);
    });
  });
}

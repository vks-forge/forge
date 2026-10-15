/**
 * Contract cases for `cards`, `cardEvents`, `cardTypes` and `tickets.listByCard`.
 *
 * Why: the Board and the Card page rest on these rows behaving the same in SQLite and in
 *   memory: card numbers must continue from the highest stored one (two intakes may not
 *   share an id), history `seq` must be gap-free per card (a page boundary is a cursor),
 *   a patch may clear only optional columns, a ticket's card link must be stored and never
 *   patched away, a rolled-back transaction must leave no half-made card, and a fresh
 *   registry must hold the four built-in types.
 *
 * Exports: describeCardsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { BUILTIN_CARD_TYPES } from '@forge/core';
import type { Card, CardId, NewCardEvent, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { T0, makeTicket } from '#tests/helpers/fixtures.js';

const id = (n: number) => `SF-C${n}` as CardId;
const at = (minute: number) => `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

const card = (n: number, over: Partial<Card> = {}): Card => ({
  id: id(n),
  project: 'SF',
  type: 'issue',
  title: `Card ${n}`,
  summary: 'summary',
  source: { kind: 'chat', ref: `msg-${n}` },
  created_by: { type: 'user', id: 'u1' },
  created_at: T0,
  updated_at: T0,
  ...over,
});

const note = (text: string, minute = 0): NewCardEvent => ({
  kind: 'note',
  at: at(minute),
  actor: { type: 'system', id: 's' },
  payload: { text },
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeCardsContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('cards', () => {
    it('stores a card and reads it back, absent optionals staying absent', async () => {
      const full = card(1, { closed_reason: 'dup', budget_cap_usd: 12.5 });

      await tx(async (t) => {
        await t.cards.insert(full);
        await t.cards.insert(card(2));
      });

      expect(await tx((t) => t.cards.get(id(1)))).toEqual(full);
      expect(await tx((t) => t.cards.get(id(2)))).toEqual(card(2));
      expect(await tx((t) => t.cards.get(id(3)))).toBeNull();
    });

    it('refuses a duplicate id', async () => {
      await tx((t) => t.cards.insert(card(1)));

      await expect(tx((t) => t.cards.insert(card(1)))).rejects.toThrow();
    });

    it('numbers the next card from the highest stored number of that prefix only', async () => {
      expect(await tx((t) => t.cards.nextNumber('SF'))).toBe(1);

      await tx(async (t) => {
        await t.cards.insert(card(1));
        await t.cards.insert(card(10));
        await t.cards.insert({ ...card(1), id: 'SFX-C99' as CardId });
      });

      expect(await tx((t) => t.cards.nextNumber('SF'))).toBe(11);
      expect(await tx((t) => t.cards.nextNumber('SFX'))).toBe(100);
      expect(await tx((t) => t.cards.nextNumber('S'))).toBe(1);
    });

    it('lists one project newest change first, with id as tie-break, filters by type and pages', async () => {
      await tx(async (t) => {
        await t.cards.insert(card(1, { updated_at: at(5) }));
        await t.cards.insert(card(2, { updated_at: at(9), type: 'discussion' }));
        await t.cards.insert(card(3, { updated_at: at(9) }));
        await t.cards.insert({ ...card(4), project: 'OTHER', id: 'OT-C4' as CardId });
      });

      const all = await tx((t) => t.cards.listByProject('SF', { limit: 10 }));
      const typed = await tx((t) =>
        t.cards.listByProject('SF', { limit: 10, type: 'discussion' }),
      );

      const page2 = await tx((t) =>
        t.cards.listByProject('SF', {
          limit: 10,
          after: { updated_at: at(9), id: 'SF-C3' },
        }),
      );

      expect(all.map((c) => c.id)).toEqual(['SF-C3', 'SF-C2', 'SF-C1']);
      expect(typed.map((c) => c.id)).toEqual(['SF-C2']);
      expect(page2.map((c) => c.id)).toEqual(['SF-C2', 'SF-C1']);
    });

    it('updates the type and closes, clears only optional columns, and reports an unknown card', async () => {
      await tx((t) => t.cards.insert(card(1, { budget_cap_usd: 3 })));

      const changed = await tx((t) =>
        t.cards.update(id(1), { type: 'plan', closed_reason: 'dup', updated_at: at(7) }),
      );

      expect(changed).toBe(true);
      expect(await tx((t) => t.cards.get(id(1)))).toMatchObject({
        type: 'plan',
        closed_reason: 'dup',
        budget_cap_usd: 3,
        updated_at: at(7),
      });

      await tx((t) =>
        t.cards.update(id(1), {
          closed_reason: undefined,
          budget_cap_usd: undefined,
          updated_at: at(8),
        }),
      );

      const reopened = await tx((t) => t.cards.get(id(1)));
      expect(reopened?.closed_reason).toBeUndefined();
      expect(reopened?.budget_cap_usd).toBeUndefined();

      await expect(
        tx((t) =>
          t.cards.update(id(1), { title: undefined, updated_at: at(9) } as never),
        ),
      ).rejects.toThrow();

      expect(await tx((t) => t.cards.update(id(9), { updated_at: at(9) }))).toBe(false);
    });

    it('rolls a card and its events back with the transaction', async () => {
      await tx(async (t) => {
        await t.cards.insert(card(1));
        await t.cardEvents.append(id(1), note('hi'));
        throw new Error('boom');
      }).catch(() => undefined);

      expect(await tx((t) => t.cards.get(id(1)))).toBeNull();
      expect(await tx((t) => t.cardEvents.list(id(1), { limit: 10 }))).toEqual([]);
    });
  });

  describe('cardEvents', () => {
    it('numbers events from 0 per card and reads them back oldest first', async () => {
      const first = await tx((t) => t.cardEvents.append(id(1), note('a', 1)));
      const second = await tx((t) => t.cardEvents.append(id(1), note('b', 2)));
      const other = await tx((t) => t.cardEvents.append(id(2), note('c', 3)));

      expect([first.seq, second.seq, other.seq]).toEqual([0, 1, 0]);
      expect(first).toMatchObject({
        card_id: 'SF-C1',
        kind: 'note',
        payload: { text: 'a' },
      });

      const list = await tx((t) => t.cardEvents.list(id(1), { limit: 10 }));
      expect(list.map((e) => e.seq)).toEqual([0, 1]);
    });

    it('pages strictly after a seq with a limit', async () => {
      await tx(async (t) => {
        for (const text of ['a', 'b', 'c', 'd']) {
          await t.cardEvents.append(id(1), note(text));
        }
      });

      const page = await tx((t) => t.cardEvents.list(id(1), { afterSeq: 0, limit: 2 }));
      const rest = await tx((t) => t.cardEvents.list(id(1), { afterSeq: 2, limit: 5 }));

      expect(page.map((e) => e.seq)).toEqual([1, 2]);
      expect(rest.map((e) => e.seq)).toEqual([3]);
    });

    it('keeps each kind payload, actor and time intact', async () => {
      const event: NewCardEvent = {
        kind: 'ticket_state',
        at: at(4),
        actor: { type: 'director', id: 'engine' },
        payload: { ticket_id: 'SF-1', from: 'inbox', to: 'blocked', reason: 'dep' },
      };

      await tx((t) => t.cardEvents.append(id(1), event));

      const [stored] = await tx((t) => t.cardEvents.list(id(1), { limit: 1 }));
      expect(stored).toEqual({ ...event, card_id: 'SF-C1', seq: 0 });
    });

    it('refuses an event whose payload does not match its kind', async () => {
      const bad = { ...note('x'), payload: { nope: true } } as unknown as NewCardEvent;

      await expect(tx((t) => t.cardEvents.append(id(1), bad))).rejects.toThrow();
    });
  });

  describe('cardTypes', () => {
    it('starts with the built-in types in display order', async () => {
      const types = await tx((t) => t.cardTypes.list());

      expect(types).toEqual([...BUILTIN_CARD_TYPES]);
      expect(await tx((t) => t.cardTypes.get('plan'))).toEqual(
        BUILTIN_CARD_TYPES.find((x) => x.name === 'plan'),
      );

      expect(await tx((t) => t.cardTypes.get('epic'))).toBeNull();
    });

    it('adds a type as data and replaces one in place', async () => {
      const epic = {
        name: 'epic',
        label: 'Epic',
        icon: 'layers',
        allowed_sources: ['chat' as const],
        actions: ['chat'],
        plan_approval: true,
        tickets_on_intake: false,
        default_lane: 'full' as const,
      };

      await tx((t) => t.cardTypes.upsert(epic));
      await tx((t) => t.cardTypes.upsert({ ...BUILTIN_CARD_TYPES[0]!, label: 'Talk' }));

      const types = await tx((t) => t.cardTypes.list());

      expect(types.map((x) => x.name)).toEqual([
        'discussion',
        'plan',
        'issue',
        'pr_issue',
        'epic',
      ]);

      expect(types[0]?.label).toBe('Talk');
      expect(await tx((t) => t.cardTypes.get('epic'))).toEqual(epic);
    });
  });

  describe('tickets and cards', () => {
    it('stores the card link, lists a card tickets oldest first, and never patches the link away', async () => {
      await tx(async (t) => {
        await t.tickets.insert(makeTicket(1, { card_id: id(1) }));
        await t.tickets.insert(makeTicket(2));
        await t.tickets.insert(makeTicket(3, { card_id: id(1) }));
      });

      const linked = await tx((t) => t.tickets.listByCard(id(1)));
      expect(linked.map((x) => x.id)).toEqual(['SF-1', 'SF-3']);
      expect(linked[0]?.card_id).toBe('SF-C1');
      expect((await tx((t) => t.tickets.get(makeTicket(2).id)))?.card_id).toBeUndefined();

      const patch = { card_id: id(2) } as never;
      await expect(
        tx((t) => t.tickets.updateTicketCas(makeTicket(1).id, 0, patch)),
      ).rejects.toThrow();

      expect(await tx((t) => t.tickets.listByCard(id(2)))).toEqual([]);
    });
  });
}

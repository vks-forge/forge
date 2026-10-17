/**
 * Tracked storage: committed writes announce which queries went stale.
 *
 * Why: the control room updates live only if every write path tells the stream, and the writes
 *   come from the engine tick, intake, routes, answers and run settling. Wrapping the one
 *   storage port is what keeps a writer from forgetting. The wrapper must name the right keys
 *   for a card, a ticket, a question and an inbox mark (with the project's slug, not its id),
 *   must say nothing for a read or a rolled-back transaction (a client would refetch a state
 *   that never existed), and must change nothing about what storage does.
 *
 * Pins: card insert, update, phase and event writes; relation edits (both cards); ticket
 *   insert and CAS; interaction insert, answer and expire (ticket, card and inbox keys);
 *   inbox mark; slug used when id and slug differ; reads and rollbacks announce nothing;
 *   one announcement per transaction per project with distinct keys; a throwing listener does
 *   not fail the write; results and errors pass through.
 * Depends on: src/services/{tracked-storage,project-events}, @forge/db (memory), @forge/core, vitest.
 */

import type { Card, CardId, Interaction, Ticket } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { createProjectEvents } from '#/services/project-events.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';

const T = '2026-10-16T00:00:00.000Z';

const card = (n: number, project = 'p1'): Card => ({
  id: `FX-C${n}` as CardId,
  project,
  type: 'issue',
  title: 'T',
  summary: 's',
  source: { kind: 'chat', ref: `k${n}` },
  created_by: { type: 'user', id: 'u' },
  created_at: T,
  updated_at: T,
  phase: 'grilling',
  phase_version: 0,
  needs_you: false,
  priority: 'normal',
  links: [],
});

const ticket = (n: number, cardId?: CardId): Ticket => ({
  id: `FX-${n}` as Ticket['id'],
  project: 'p1',
  ...(cardId ? { card_id: cardId } : {}),
  title: 't',
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'inbox',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: T,
  updated_at: T,
  blocked_by: [],
});

const question = (id: string, over: Partial<Interaction> = {}): Interaction => ({
  id,
  ticket_id: 'FX-1',
  kind: 'question',
  payload: { prompt: 'which?' },
  status: 'pending',
  asked_at: T,
  timeout_at: '2099-01-01T00:00:00.000Z',
  ...over,
});

/** Tracked storage over memory with project `p1` whose slug is `dcp`. */
async function setup() {
  const raw = createMemoryStorage();
  const events = createProjectEvents();
  const seen: { slug: string; keys: string[] }[] = [];
  const watch = (slug: string) =>
    events.subscribe(slug, (keys) =>
      seen.push({ slug, keys: keys.map((k) => k.join(':')) }),
    );

  watch('dcp');
  watch('p1');
  await raw.transaction((tx) =>
    tx.projects.upsert({
      id: 'p1',
      slug: 'dcp',
      prefix: 'FX',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    }),
  );

  return { storage: trackProjectWrites(raw, events), raw, seen, events };
}

describe('trackProjectWrites', () => {
  it('announces the cards list and the card when a card is inserted, with the project slug', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) => tx.cards.insert(card(1)));

    expect(seen).toEqual([{ slug: 'dcp', keys: ['card:FX-C1', 'cards:dcp'] }]);
  });

  it('announces a card update, a phase move and a card event', async () => {
    const { storage, seen } = await setup();
    await storage.transaction((tx) => tx.cards.insert(card(1)));
    seen.length = 0;

    await storage.transaction((tx) =>
      tx.cards.update('FX-C1' as CardId, { updated_at: T }),
    );

    await storage.transaction((tx) =>
      tx.cards.updatePhase('FX-C1' as CardId, 0, {
        phase: 'plan_ready',
        needs_you: true,
        updated_at: T,
      }),
    );

    await storage.transaction((tx) =>
      tx.cardEvents.append('FX-C1' as CardId, {
        kind: 'note',
        at: T,
        actor: { type: 'system', id: 's' },
        payload: { text: 'hi' },
      }),
    );

    expect(seen).toHaveLength(3);
    expect(
      seen.every((s) => s.slug === 'dcp' && s.keys.join() === 'card:FX-C1,cards:dcp'),
    ).toBe(true);
  });

  it('announces both cards when a relation edit touches them', async () => {
    const { storage, seen } = await setup();
    await storage.transaction(async (tx) => {
      await tx.cards.insert(card(1));
      await tx.cards.insert(card(2));
    });

    seen.length = 0;
    await storage.transaction((tx) =>
      tx.cardRelations.replaceFor('FX-C1' as CardId, ['FX-C2' as CardId], [], T),
    );

    expect(seen).toEqual([
      { slug: 'dcp', keys: ['card:FX-C1', 'cards:dcp', 'card:FX-C2'] },
    ]);
  });

  it('announces tickets, cards, inbox and the ticket card for a ticket write', async () => {
    const { storage, seen } = await setup();
    await storage.transaction((tx) => tx.cards.insert(card(1)));
    seen.length = 0;

    await storage.transaction((tx) => tx.tickets.insert(ticket(1, 'FX-C1' as CardId)));
    await storage.transaction((tx) =>
      tx.tickets.updateTicketCas('FX-1' as Ticket['id'], 0, { status: 'planned' }),
    );

    expect(seen).toHaveLength(2);
    for (const s of seen) {
      expect(s.slug).toBe('dcp');
      expect(s.keys).toEqual(
        expect.arrayContaining(['tickets:dcp', 'cards:dcp', 'inbox:dcp', 'card:FX-C1']),
      );
    }
  });

  it('announces a ticket without a card without a card key', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) => tx.tickets.insert(ticket(1)));

    expect(seen[0]?.keys.sort()).toEqual([
      'cards:dcp',
      'inbox:dcp',
      'ticket:FX-1',
      'tickets:dcp',
    ]);
  });

  it('announces a question on insert, answer and expire, through its ticket and card', async () => {
    const { storage, seen } = await setup();
    await storage.transaction(async (tx) => {
      await tx.cards.insert(card(1));
      await tx.tickets.insert(ticket(1, 'FX-C1' as CardId));
    });

    seen.length = 0;
    await storage.transaction((tx) => tx.interactions.insert(question('i1')));
    await storage.transaction((tx) => tx.interactions.answer('i1', 'yes', T));
    await storage.transaction((tx) => tx.interactions.insert(question('i2')));
    await storage.transaction((tx) =>
      tx.interactions.expire('i2', '2100-01-01T00:00:00.000Z'),
    );

    expect(seen).toHaveLength(4);
    for (const s of seen) {
      expect(s.keys).toEqual(
        expect.arrayContaining(['inbox:dcp', 'tickets:dcp', 'cards:dcp', 'card:FX-C1']),
      );
    }
  });

  it('announces the card a question belongs to when it carries a card id', async () => {
    const { storage, seen } = await setup();
    await storage.transaction((tx) => tx.cards.insert(card(1)));
    seen.length = 0;

    await storage.transaction((tx) =>
      tx.interactions.insert(
        question('i1', { ticket_id: 'none', card_id: 'FX-C1' as CardId }),
      ),
    );

    expect(seen[0]?.keys).toEqual(
      expect.arrayContaining(['card:FX-C1', 'cards:dcp', 'inbox:dcp']),
    );
  });

  it('announces the inbox for a mark, using the slug of the project id', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) =>
      tx.inboxStates.upsert({ project: 'p1', kind: 'question', item_id: 'i' }),
    );

    expect(seen).toEqual([{ slug: 'dcp', keys: ['inbox:dcp'] }]);
  });

  it('merges one transaction into one announcement per project with distinct keys', async () => {
    const { storage, seen } = await setup();

    await storage.transaction(async (tx) => {
      await tx.cards.insert(card(1));
      await tx.cards.update('FX-C1' as CardId, { updated_at: T });
      await tx.cardEvents.append('FX-C1' as CardId, {
        kind: 'note',
        at: T,
        actor: { type: 'system', id: 's' },
        payload: { text: 'hi' },
      });
    });

    expect(seen).toEqual([{ slug: 'dcp', keys: ['card:FX-C1', 'cards:dcp'] }]);
  });

  it('announces nothing for a read, and nothing for a rolled-back transaction', async () => {
    const { storage, seen } = await setup();
    await storage.transaction((tx) => tx.cards.insert(card(1)));
    seen.length = 0;

    await storage.transaction((tx) => tx.cards.get('FX-C1' as CardId));
    await expect(
      storage.transaction(async (tx) => {
        await tx.cards.insert(card(2));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(seen).toEqual([]);
    expect(await storage.transaction((tx) => tx.cards.get('FX-C2' as CardId))).toBeNull();
  });

  it('keeps storage behaviour: results pass through and a failed write throws and announces nothing', async () => {
    const { storage, seen } = await setup();
    await storage.transaction((tx) => tx.cards.insert(card(1)));
    seen.length = 0;

    const found = await storage.transaction((tx) => tx.cards.get('FX-C1' as CardId));
    await expect(storage.transaction((tx) => tx.cards.insert(card(1)))).rejects.toThrow();

    expect(found?.id).toBe('FX-C1');
    expect(seen).toEqual([]);
  });

  it('does not fail the write when a listener throws', async () => {
    const { storage, events } = await setup();
    events.subscribe('dcp', () => {
      throw new Error('stream closed');
    });

    await expect(
      storage.transaction((tx) => tx.cards.insert(card(1))),
    ).resolves.toBeUndefined();

    expect(
      await storage.transaction((tx) => tx.cards.get('FX-C1' as CardId)),
    ).not.toBeNull();
  });
});

/**
 * Tracked storage announces the ticket page and the escalation hand-over.
 *
 * Why: the Ticket page, the Card page and the Inbox update within a second of any change
 *   (d-0132), so every write that touches a ticket or one of its waits must name the ticket
 *   page's own query (`["ticket", id]`), which nothing invalidated before escalations, and the
 *   Director's hand-over of a wait to the owner (`escalate`) must announce like an answer does,
 *   or the owner would not see the wait appear until the next poll.
 *
 * Pins: a ticket write names `ticket:<id>`; an interaction insert and its `escalate` name the
 *   ticket, its card and the inbox.
 * Depends on: src/services/tracked-storage, src/services/project-events, @forge/db, vitest.
 */

import type { CardId, Ticket } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { createProjectEvents } from '#/services/project-events.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';
import { at, card, project, question, ticket } from '#tests/helpers/card-rig.js';

async function setup() {
  const events = createProjectEvents();
  const seen: string[][] = [];
  events.subscribe('fixture', (keys) => seen.push(keys.map((k) => k.join(':'))));
  const storage = trackProjectWrites(createMemoryStorage(), events);
  await storage.transaction(async (tx) => {
    await tx.projects.upsert(project('fixture', 'FX'));
    await tx.cards.insert(card(1));
    await tx.tickets.insert(ticket(1, 1, { card_id: 'FX-C1' as CardId }));
  });

  seen.length = 0;

  return { storage, seen };
}

describe('tracked storage and escalations', () => {
  it('names the ticket page on a ticket write', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) =>
      tx.tickets.updateTicketCas('FX-1' as Ticket['id'], 0, { status: 'planned' }),
    );

    expect(seen[0]).toEqual(expect.arrayContaining(['ticket:FX-1', 'tickets:fixture']));
  });

  it('announces an interaction and its escalate through the ticket, the card and the inbox', async () => {
    const { storage, seen } = await setup();
    const { escalated_at: _stage, ...directorStage } = question('FX-1');
    void _stage;

    await storage.transaction((tx) => tx.interactions.insert(directorStage));
    await storage.transaction((tx) =>
      tx.interactions.escalate(
        directorStage.id,
        { payload: { prompt: 'x' }, escalated_at: at(5) },
        at(5),
      ),
    );

    expect(seen).toHaveLength(2);
    for (const keys of seen) {
      expect(keys).toEqual(
        expect.arrayContaining(['ticket:FX-1', 'card:FX-C1', 'inbox:fixture']),
      );
    }
  });
});

/**
 * Scenario: every intake becomes a card with a readable history.
 *
 * Why: the Board and the Card page are built on the card, the record of an intake (d-0105).
 *   If intake made a ticket without its card, or a card whose history disagrees with its
 *   tickets, the owner would see work on the Board that has no request behind it, or a
 *   request that silently produced nothing. A Discussion must make no ticket, an unknown
 *   type must fail closed, and a ticket moving must reach the card's timeline through the
 *   same door as the move itself.
 *
 * Pins: card created before its ticket, linked by card_id, with user_message and
 *   ticket_created events; discussion makes a card only; unknown type and a source the type
 *   refuses are ignored and create nothing; duplicates make no second card; ticket_state
 *   events follow triage and dispatch; an answered question is logged; card ids count per
 *   project; the issue author is the creator of a card from an issue; a Worker's question
 *   shows on the card as opened, then the ticket as waiting for a human.
 * Depends on: helpers/rig, helpers/scripted-driver, @forge/core types, vitest.
 */

import type { CardEvent, CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { intake, makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const C1 = 'FG-C1' as CardId;

const history = (rig: Rig, cardId: CardId): Promise<CardEvent[]> =>
  rig.storage.transaction((tx) => tx.cardEvents.list(cardId, { limit: 100 }));

describe('card intake', () => {
  it('creates the card first, then a ticket linked to it, and logs both', async () => {
    const rig = await makeRig();

    const result = await rig.engine.ingest(
      intake({ payload: { text: 'Fix the doctor check' } }, rig.clock.now()),
    );

    expect(result).toEqual({
      status: 'ticket_created',
      ticketId: 'FG-1',
      cardId: 'FG-C1',
    });

    const card = await rig.storage.transaction((tx) => tx.cards.get(C1));
    expect(card).toMatchObject({
      id: 'FG-C1',
      project: 'forge',
      type: 'issue',
      title: 'Fix the doctor check',
      summary: 'Fix the doctor check',
      source: { kind: 'chat' },
      created_by: { type: 'user', id: 'u1' },
    });

    expect((await rig.ticket('FG-1')).card_id).toBe('FG-C1');
    const events = await history(rig, C1);
    expect(events.map((e) => e.kind)).toEqual(['user_message', 'ticket_created']);
    expect(events[0]?.payload).toEqual({ text: 'Fix the doctor check' });
    expect(events[1]?.payload).toEqual({
      ticket_id: 'FG-1',
      title: 'Fix the doctor check',
    });
  });

  it('makes a card and no ticket for a discussion', async () => {
    const rig = await makeRig();

    const result = await rig.engine.ingest(
      intake({ payload: { text: 'Should we move to pnpm?', card_type: 'discussion' } }),
    );

    expect(result).toEqual({ status: 'card_created', cardId: 'FG-C1' });
    const tickets = await rig.storage.transaction((tx) => tx.tickets.listByCard(C1));
    expect(tickets).toEqual([]);
    expect((await history(rig, C1)).map((e) => e.kind)).toEqual(['user_message']);
  });

  it('ignores an unknown card type and a type that refuses the source, creating nothing', async () => {
    const rig = await makeRig();

    const unknown = await rig.engine.ingest(
      intake({ payload: { text: 'x', card_type: 'epic' } }),
    );

    const refused = await rig.engine.ingest(
      intake({ source: 'cron', payload: { text: 'y', card_type: 'discussion' } }),
    );

    expect(unknown).toEqual({ status: 'ignored', reason: 'unknown card type epic' });
    expect(refused).toEqual({
      status: 'ignored',
      reason: 'card type discussion does not accept cron',
    });

    const cards = await rig.storage.transaction((tx) =>
      tx.cards.listByProject('forge', { limit: 10 }),
    );

    expect(cards).toEqual([]);
  });

  it('does not make a second card for a redelivered event, and numbers cards per project', async () => {
    const rig = await makeRig();
    const event = intake({ payload: { text: 'once' } }, rig.clock.now());

    const first = await rig.engine.ingest(event);
    const again = await rig.engine.ingest(event);
    const second = await rig.engine.ingest(intake({ payload: { text: 'twice' } }));

    expect(first).toMatchObject({ cardId: 'FG-C1' });
    expect(again).toEqual({ status: 'duplicate' });
    expect(second).toMatchObject({ cardId: 'FG-C2', ticketId: 'FG-2' });
  });

  it('names the issue author as the creator of a card from an issue', async () => {
    const rig = await makeRig();

    await rig.engine.ingest(
      intake({
        source: 'github_issue',
        actor: { type: 'external', id: 'webhook-1' },
        author: { kind: 'github', login: 'octocat' },
        payload: { text: 'Crash on start' },
      }),
    );

    const card = await rig.storage.transaction((tx) => tx.cards.get(C1));

    expect(card?.created_by).toEqual({ type: 'github', id: 'octocat' });
    expect(card?.source.kind).toBe('github_issue');
  });

  it('writes a ticket_state event for every move through transition()', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');

    await rig.tick();

    const states = (await history(rig, C1))
      .filter((e) => e.kind === 'ticket_state')
      .map((e) => e.payload);

    expect(states).toEqual([
      { ticket_id: 'FG-1', from: 'inbox', to: 'planned' },
      { ticket_id: 'FG-1', from: 'planned', to: 'in_progress' },
    ]);
  });

  it('logs an answered question on the card of the waiting ticket', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    await rig.storage.transaction(async (tx) => {
      await tx.interactions.insert({
        id: 'int-1',
        ticket_id: 'FG-1',
        kind: 'question',
        payload: { prompt: 'which?' },
        status: 'pending',
        asked_at: '2026-10-13T00:00:00.000Z',
        timeout_at: '2099-01-01T00:00:00.000Z',
      });
    });

    const won = await rig.engine.answerInteraction('int-1', 'the first');

    expect(won).toBe(true);
    const last = (await history(rig, C1)).at(-1);
    expect(last).toMatchObject({
      kind: 'interaction_answered',
      payload: { ticket_id: 'FG-1', interaction_id: 'int-1' },
    });
  });

  it('logs a Worker question as opened, before the ticket waiting for a human', async () => {
    const rig = await makeRig();
    await rig.request('Add a flag');
    await rig.tick();
    rig.driver.emit('run-1', {
      type: 'ask',
      interaction_id: 'int-q1',
      kind: 'question',
      prompt: 'Which colour?',
    });

    rig.driver.finish(
      'run-1',
      makeResult({
        status: 'paused',
        pauseReason: 'interaction',
        interactionId: 'int-q1',
        session: 'sess-A',
      }),
    );

    await rig.flush();
    await rig.tick();

    const tail = (await history(rig, C1)).slice(-2);

    expect(tail.map((e) => e.kind)).toEqual(['interaction_opened', 'ticket_state']);
    expect(tail[0]?.payload).toEqual({
      ticket_id: 'FG-1',
      interaction_id: 'int-q1',
      interaction_kind: 'question',
    });
  });
});

/**
 * Scenario: every intake becomes a card with a readable history.
 *
 * Why: the Board and the Card page are built on the card, the record of an intake (d-0105),
 *   and under the card-first flow the Director plans before any work exists (d-0128). If
 *   intake made a ticket for a request the Director has not planned, the owner would see
 *   work start with no questions asked; if it made a card without queuing the Director's
 *   reply, the card would sit silent. Only the PR fast path files a ticket at intake. An
 *   unknown type must fail closed, and a ticket moving must reach the card's timeline and
 *   the card's own phase through the same door as the move itself.
 *
 * Pins: a chat request makes a `grilling` card, no ticket and a queued reply; the PR fast
 *   path makes a `queued` card linked to its ticket, with user_message and ticket_created
 *   events and no Director turn; the card follows its first started ticket to in_progress (the done step is pinned in tick/card-phase);
 *   discussion makes a card only; unknown type and a source the type
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

const card = (rig: Rig) => rig.storage.transaction((tx) => tx.cards.get(C1));

describe('card intake', () => {
  it('makes a card in grilling and no ticket for a chat request, and queues the Director', async () => {
    const rig = await makeRig();

    const result = await rig.engine.ingest(
      intake({ payload: { text: 'Fix the doctor check' } }, rig.clock.now()),
    );

    expect(result).toEqual({ status: 'card_created', cardId: 'FG-C1' });

    const card = await rig.storage.transaction((tx) => tx.cards.get(C1));
    expect(card).toMatchObject({
      id: 'FG-C1',
      project: 'forge',
      type: 'issue',
      title: 'Fix the doctor check',
      summary: 'Fix the doctor check',
      source: { kind: 'chat' },
      created_by: { type: 'user', id: 'u1' },
      phase: 'grilling',
      phase_version: 0,
      needs_you: false,
      priority: 'normal',
      links: [],
    });

    const tickets = await rig.storage.transaction((tx) => tx.tickets.listByCard(C1));
    const queue = await rig.storage.transaction((tx) => tx.cardReplyQueue.listOpen(C1));

    expect(tickets).toEqual([]);
    expect((await history(rig, C1)).map((e) => e.kind)).toEqual(['user_message']);
    expect(queue).toMatchObject([
      { card_id: 'FG-C1', event_id: 0, reason: 'card_created' },
    ]);

    expect(rig.tickRequests.count).toBe(1);
  });

  it('files a ticket at intake only on the PR fast path, with the card queued and no Director turn', async () => {
    const rig = await makeRig();

    const result = await rig.engine.ingest(
      intake(
        { payload: { text: 'Fix the doctor check', card_type: 'pr_issue' } },
        rig.clock.now(),
      ),
    );

    expect(result).toEqual({
      status: 'ticket_created',
      ticketId: 'FG-1',
      cardId: 'FG-C1',
    });

    const card = await rig.storage.transaction((tx) => tx.cards.get(C1));
    expect(card).toMatchObject({ type: 'pr_issue', phase: 'queued' });
    expect((await rig.ticket('FG-1')).card_id).toBe('FG-C1');

    const events = await history(rig, C1);
    expect(events.map((e) => e.kind)).toEqual(['user_message', 'ticket_created']);
    expect(events[0]?.payload).toEqual({ text: 'Fix the doctor check' });
    expect(events[1]?.payload).toEqual({
      ticket_id: 'FG-1',
      title: 'Fix the doctor check',
    });

    expect(await rig.storage.transaction((tx) => tx.cardReplyQueue.listOpen(C1))).toEqual(
      [],
    );
  });

  it('moves a fast-path card to in_progress when its ticket starts', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    const queued = await card(rig);

    await rig.tick();
    const started = await card(rig);

    expect(queued).toMatchObject({ phase: 'queued', phase_version: 0 });
    expect(started).toMatchObject({ phase: 'in_progress', needs_you: false });
    expect(started?.phase_version).toBeGreaterThan(0);
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
    expect(second).toEqual({ status: 'card_created', cardId: 'FG-C2' });
    expect(
      await rig.storage.transaction((tx) => tx.cardReplyQueue.listOpen(C1)),
    ).toHaveLength(1);
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

    const events = await history(rig, C1);
    const opened = events.findIndex((e) => e.kind === 'interaction_opened');
    const waiting = events.findIndex(
      (e) => e.kind === 'ticket_state' && e.payload.to === 'waiting_human',
    );

    // The question opens before the ticket waits; the Director's first look follows both.
    expect(opened).toBeGreaterThan(-1);
    expect(opened).toBeLessThan(waiting);
    expect(events[opened]?.payload).toEqual({
      ticket_id: 'FG-1',
      interaction_id: 'int-q1',
      interaction_kind: 'question',
    });
  });
});

/**
 * Scenario: the Director's owed replies are stored, not remembered.
 *
 * Why: a card gets a Director turn when it is created and when the owner writes in its chat
 *   (d-0134). If that debt lived in engine memory, a restart would drop the message and the
 *   owner would wait on a Director that never knew it was asked. The queue is a table: a new
 *   card or message adds a row in the same transaction as the event, the tick claims and
 *   completes rows, a restarted engine resumes unclaimed rows, and a row claimed by a process
 *   that died is taken again once the claim is ten minutes old, never sooner.
 *
 * Pins: a message queues a row naming its event; a restarted engine answers a message the
 *   first never ticked on; a new card is answered on the next tick; several queued messages
 *   make one model call; a fresh claim is left alone and a stale one is retaken; rows are
 *   completed after a reply and after a failed one; the watchers are told when the Director
 *   stops thinking.
 * Depends on: helpers/card-chat, helpers/rig, helpers/scripted-llm, @forge/core, vitest.
 */

import { describe, expect, it, vi } from 'vitest';
import { STALE_CLAIM_MS } from '#/tick/card-chat.js';
import { C1, discussion, history, kinds, say } from '#tests/helpers/card-chat.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const open = (rig: Rig) =>
  rig.storage.transaction((tx) => tx.cardReplyQueue.listOpen(C1));

const replies = async (rig: Rig) =>
  (await kinds(rig)).filter((k) => k === 'director_message').length;

describe('card reply queue', () => {
  it('queues a row naming the user message when the owner writes', async () => {
    const rig = await makeRig();
    await discussion(rig);

    await say(rig, 'what about npm?');

    expect(await open(rig)).toMatchObject([
      { reason: 'card_created', event_id: 0 },
      { reason: 'user_message', event_id: 1 },
    ]);

    expect(rig.engine.cardDirector('FG-C1')).toEqual({ state: 'thinking' });
  });

  it('answers a new card on the next tick and completes its row', async () => {
    const rig = await makeRig();
    rig.llm.script('card_chat', { reply: 'Tell me more.', actions: [] });
    await discussion(rig);

    await rig.tick();

    expect(await replies(rig)).toBe(1);
    expect(await open(rig)).toEqual([]);
    expect(rig.engine.cardDirector('FG-C1')).toEqual({ state: 'idle' });
  });

  it('lets a restarted engine answer a message the first engine never ticked on', async () => {
    const rig = await makeRig();
    await discussion(rig);
    await say(rig, 'please answer');

    const restarted = rig.restart('srv-b');
    rig.llm.script('card_chat', { reply: 'Back from a restart.', actions: [] });
    await rig.tickOn(restarted);

    expect(await replies(rig)).toBe(1);
    expect((await history(rig)).at(-1)).toMatchObject({
      kind: 'director_message',
      payload: { text: 'Back from a restart.' },
    });

    expect(await open(rig)).toEqual([]);
  });

  it('makes one model call however many messages queued up', async () => {
    const rig = await makeRig();
    await discussion(rig);
    await say(rig, 'one');
    await say(rig, 'two');

    await rig.tick();

    expect(rig.llm.callsTo('card_chat')).toHaveLength(1);
    expect(await open(rig)).toEqual([]);
  });

  it('leaves a fresh claim alone and takes a stale one again', async () => {
    const rig = await makeRig();
    await discussion(rig);
    const claimedAt = new Date(rig.clock.now() - 60_000).toISOString();
    await rig.storage.transaction((tx) => tx.cardReplyQueue.claim(claimedAt, claimedAt));

    await rig.tick();
    expect(await replies(rig)).toBe(0);
    expect(await open(rig)).toHaveLength(1);

    rig.clock.advance(STALE_CLAIM_MS + 1_000);
    await rig.tick();

    expect(await replies(rig)).toBe(1);
    expect(await open(rig)).toEqual([]);
  });

  it('completes the rows after a failed reply, so the next message retries cleanly', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.script('card_chat', { reply: '', actions: [] });

    await say(rig);
    await rig.tick();

    expect(rig.engine.cardDirector('FG-C1')).toMatchObject({ state: 'error' });
    expect(await open(rig)).toEqual([]);

    rig.llm.script('card_chat', { reply: 'Back.', actions: [] });
    await say(rig, 'try again');
    await rig.tick();

    expect(rig.engine.cardDirector('FG-C1')).toEqual({ state: 'idle' });
    expect(await open(rig)).toEqual([]);
  });

  it('tells the watchers of the project when the Director stops thinking', async () => {
    const rig = await makeRig();
    const invalidate = vi.fn();
    const engine = rig.restart('srv-b', { projectEvents: { invalidate } });
    await discussion(rig);
    rig.llm.script('card_chat', { reply: 'Hello.', actions: [] });

    await rig.tickOn(engine);

    expect(invalidate).toHaveBeenCalledWith('forge', [['card', 'FG-C1']]);
  });
});

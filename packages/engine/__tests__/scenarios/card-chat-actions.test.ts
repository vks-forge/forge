/**
 * Scenario: the card's Director acts on what it is told, only through existing doors.
 *
 * Why: the Director may file tickets, steer Workers and retype the card (d-0109), but its
 *   reply is untrusted: each action must run through the code a person's request would use,
 *   only if the card type allows it, and a refusal must be a readable note rather than a
 *   crash. It may suggest closing a card but never close it (d-0112).
 *
 * Pins: create_ticket (linked, numbered, triaged the same tick, `director_action` and
 *   `actions_taken`); a Discussion refuses it; retype
 *   refusals; steer_run through `steerRun` with the Director as author, refused for a ticket
 *   of another card, without a live Worker, or unknown; suggest_close records and never
 *   closes. The phase gate and the budget warning are pinned in card-chat-phase.
 * Depends on: helpers/card-chat, helpers/rig, helpers/scripted-llm, @forge/core, vitest.
 */

import type { CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { C1, card, discussion, history, kinds, say } from '#tests/helpers/card-chat.js';
import { intake, makeRig } from '#tests/helpers/rig.js';

describe('card chat actions', () => {
  it('files a ticket linked to the card through the intake inserter and triages it this tick', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    rig.llm.script('card_chat', {
      reply: 'Filed a follow-up.',
      actions: [
        { kind: 'create_ticket', title: 'Add a doctor test', body: 'Cover the check.' },
      ],
    });

    await say(rig);
    const report = await rig.tick();

    const ticket = await rig.ticket('FG-2');
    expect(ticket).toMatchObject({ card_id: 'FG-C1', body: 'Cover the check.' });
    expect(report.triaged.map((t) => t.ticketId)).toContain('FG-2');

    const events = (await history(rig)).filter((e) => e.kind !== 'ticket_state');
    expect(events.map((e) => e.kind)).toEqual([
      'user_message',
      'ticket_created',
      'user_message',
      'ticket_created',
      'director_action',
      'director_message',
    ]);

    expect(events[4]?.payload).toMatchObject({ action: 'create_ticket', result: 'done' });
    expect(events[5]?.payload).toMatchObject({
      actions_taken: [{ action: 'create_ticket', result: 'done' }],
    });
  });

  it('refuses create_ticket on a Discussion with a note and files nothing', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.script('card_chat', {
      reply: 'Done!',
      actions: [{ kind: 'create_ticket', title: 'T', body: 'B' }],
    });

    await say(rig);
    await rig.tick();

    const tickets = await rig.storage.transaction((tx) => tx.tickets.listByCard(C1));
    expect(tickets).toEqual([]);
    const events = await history(rig);
    expect(events.map((e) => e.kind)).toEqual([
      'user_message',
      'user_message',
      'note',
      'director_message',
    ]);

    expect(events[2]?.payload).toEqual({
      text: expect.stringContaining('did not create ticket'),
    });

    expect(events[3]?.payload).toMatchObject({
      actions_taken: [{ action: 'create_ticket', result: 'refused' }],
    });
  });

  it('retypes a Discussion in order, then refuses the ticket while the card is still being planned', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.script('card_chat', {
      reply: 'Converted.',
      actions: [
        { kind: 'change_type', type: 'issue' },
        { kind: 'create_ticket', title: 'Switch to pnpm', body: 'Do it.' },
      ],
    });

    await say(rig, 'yes, do it');
    await rig.tick();

    expect((await card(rig))?.type).toBe('issue');
    expect(await rig.storage.transaction((tx) => tx.tickets.listByCard(C1))).toEqual([]);
    expect(await kinds(rig)).toEqual([
      'user_message',
      'user_message',
      'type_changed',
      'director_action',
      'note',
      'director_message',
    ]);

    const changed = (await history(rig)).find((e) => e.kind === 'type_changed');
    expect(changed).toMatchObject({
      actor: { type: 'director', id: 'card-chat' },
      payload: { from: 'discussion', to: 'issue' },
    });

    const refusal = (await history(rig)).find((e) => e.kind === 'note');
    expect(refusal?.payload).toEqual({
      text: expect.stringContaining('tickets are created when the plan is approved'),
    });
  });

  it('refuses a retype to the same type and to an unknown type', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.script('card_chat', {
      reply: 'Tried.',
      actions: [
        { kind: 'change_type', type: 'discussion' },
        { kind: 'change_type', type: 'epic' },
      ],
    });

    await say(rig);
    await rig.tick();

    const last = (await history(rig)).at(-1);
    expect(last?.kind === 'director_message' && last.payload.actions_taken).toEqual([
      expect.objectContaining({ result: 'refused' }),
      expect.objectContaining({ result: 'refused' }),
    ]);

    expect((await card(rig))?.type).toBe('discussion');
  });

  it('steers the live Worker of one of the card tickets through steerRun', async () => {
    const rig = await makeRig();
    await rig.request('Fix it');
    await rig.tick();
    rig.llm.script('card_chat', {
      reply: 'Told the Worker.',
      actions: [{ kind: 'steer_run', ticket_id: 'FG-1', message: 'use the v2 API' }],
    });

    await say(rig, 'tell the worker to use v2');
    await rig.tick();

    expect(rig.driver.steers).toEqual([
      { runId: 'run-1', message: 'use the v2 API', mode: 'steer', inboxSeq: 0 },
    ]);

    const runEvents = await rig.storage.transaction((tx) =>
      tx.runEvents.listByRun('run-1'),
    );

    expect(runEvents).toContainEqual(
      expect.objectContaining({ type: 'user_message', author: 'director' }),
    );

    expect(await kinds(rig)).toContain('director_action');
  });

  it('refuses steering a ticket of another card, a ticket with no live Worker, and an unknown ticket', async () => {
    const rig = await makeRig();
    await rig.request('Fix it');
    await rig.tick();
    await discussion(rig);
    await rig.engine.postCardMessage('FG-C2', 'steer the other card', 'vikash');
    // A fast-path card keeps card chat; a planned card talks to the planning flow instead.
    await rig.engine.ingest(
      intake({ payload: { text: 'Second request', card_type: 'pr_issue' } }),
    );

    await rig.engine.postCardMessage('FG-C3', 'steer FG-1 and FG-9', 'vikash');
    rig.llm.script(
      'card_chat',
      {
        reply: 'No.',
        actions: [{ kind: 'steer_run', ticket_id: 'FG-1', message: 'x' }],
      },
      {
        reply: 'No.',
        actions: [
          { kind: 'steer_run', ticket_id: 'FG-1', message: 'x' },
          { kind: 'steer_run', ticket_id: 'FG-2', message: 'x' },
          { kind: 'steer_run', ticket_id: 'FG-9', message: 'x' },
        ],
      },
    );

    await rig.tick();

    expect(rig.driver.steers).toEqual([]);
    const second = (await history(rig, 'FG-C3' as CardId)).find(
      (e) => e.kind === 'director_message',
    );

    expect(second?.kind === 'director_message' && second.payload.actions_taken).toEqual([
      expect.objectContaining({ result: 'refused' }),
      expect.objectContaining({ result: 'refused' }),
      expect.objectContaining({ result: 'refused' }),
    ]);
  });

  it('records a close suggestion and never closes the card', async () => {
    const rig = await makeRig();
    await rig.request('Fix it');
    rig.llm.script('card_chat', {
      reply: 'I would close this.',
      actions: [{ kind: 'suggest_close', reason: 'duplicate of FG-C4' }],
    });

    await say(rig, 'is this still needed?');
    await rig.tick();

    const events = await history(rig);
    expect(events.find((e) => e.kind === 'close_suggested')?.payload).toEqual({
      reason: 'duplicate of FG-C4',
    });

    expect((await card(rig))?.closed_reason).toBeUndefined();
    expect(events.some((e) => e.kind === 'card_closed')).toBe(false);
  });
});

/**
 * Scenario: the card's Director edits tickets through the same door as the owner.
 *
 * Why: the owner asks the Director to order restored work before the tickets that need it and to
 *   raise its priority. The Director's reply is untrusted, so each edit must run through
 *   `editTicketTx` (same project, no loop, nothing a running Worker would miss), touch only this
 *   card's tickets, and turn every refusal into a readable note. Work restored from a cancelled
 *   ticket must keep that ticket's priority, and the Director's context must name the real owner
 *   controls and the plan key behind each ticket id so it never invents a control or mixes keys with ids.
 *
 * Pins: set_ticket_dependencies / priority / description apply and log; a loop, a ticket of
 *   another card and a started ticket's description are refused; `restores` copies priority and
 *   refuses a foreign ticket; the chat input lists owner_controls and per-ticket plan_key.
 * Depends on: helpers/card-chat, helpers/rig, helpers/scripted-llm, @forge/core, vitest.
 */

import type { CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { history, say } from '#tests/helpers/card-chat.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const taken = async (rig: Rig, card = 'FG-C1') => {
  const last = (await history(rig, card as CardId)).filter(
    (e) => e.kind === 'director_message',
  );

  const msg = last.at(-1);

  return msg?.kind === 'director_message' ? msg.payload.actions_taken : undefined;
};

// Both requests are PR fast-path cards, so each keeps card chat and its own ticket.
async function twoCards(rig: Rig): Promise<void> {
  await rig.request('first');
  await rig.request('second');
}

describe('card chat ticket edit actions', () => {
  it('sets priority, dependencies and description and logs each as a Director action', async () => {
    const rig = await makeRig();
    await twoCards(rig);
    rig.llm.script('card_chat', {
      reply: 'Done.',
      actions: [
        { kind: 'set_ticket_priority', ticket_id: 'FG-1', priority: 2 },
        { kind: 'edit_ticket_description', ticket_id: 'FG-1', body: 'Sharper brief.' },
        { kind: 'set_ticket_dependencies', ticket_id: 'FG-1', depends_on: ['FG-2'] },
      ],
    });

    await say(rig, 'raise FG-1 and make it wait for FG-2');
    await rig.engine.tick();
    await rig.engine.idle();

    expect(await rig.ticket('FG-1')).toMatchObject({
      priority: 2,
      body: 'Sharper brief.',
      blocked_by: ['FG-2'],
    });

    expect(await taken(rig)).toEqual([
      expect.objectContaining({ action: 'set_ticket_priority', result: 'done' }),
      expect.objectContaining({ action: 'edit_ticket_description', result: 'done' }),
      expect.objectContaining({ action: 'set_ticket_dependencies', result: 'done' }),
    ]);

    const notes = (await history(rig)).filter((e) => e.kind === 'note');
    expect(notes.map((n) => n.payload)).toContainEqual({
      text: 'The Director made FG-1 wait for FG-2.',
    });
  });

  it('refuses a loop, another card ticket, and an id that is not a ticket, changing nothing', async () => {
    const rig = await makeRig();
    await twoCards(rig);
    await rig.engine.editTicket(
      'FG-2' as never,
      { depends_on: ['FG-1' as never] },
      {
        type: 'user',
        id: 'owner',
      },
    );

    rig.llm.script('card_chat', {
      reply: 'Tried.',
      actions: [
        { kind: 'set_ticket_dependencies', ticket_id: 'FG-1', depends_on: ['FG-2'] },
        { kind: 'set_ticket_priority', ticket_id: 'FG-2', priority: 5 },
        { kind: 'set_ticket_dependencies', ticket_id: 'FG-1', depends_on: ['nope'] },
      ],
    });

    await say(rig, 'wire these');
    await rig.engine.tick();
    await rig.engine.idle();

    expect(await taken(rig)).toEqual([
      expect.objectContaining({
        result: 'refused',
        summary: expect.stringContaining('wait on each other'),
      }),
      expect.objectContaining({
        result: 'refused',
        summary: 'FG-2 is not a ticket of this card',
      }),
      expect.objectContaining({ result: 'refused', summary: 'nope is not a ticket id' }),
    ]);

    expect((await rig.ticket('FG-1')).blocked_by).toEqual([]);
    expect((await rig.ticket('FG-2')).priority).toBe(0);
  });

  it('files restored work at the priority of the ticket it restores and refuses a foreign one', async () => {
    const rig = await makeRig();
    await twoCards(rig);
    await rig.engine.editTicket(
      'FG-2' as never,
      { priority: 4 },
      { type: 'user', id: 'owner' },
    );

    rig.llm.script('card_chat', {
      reply: 'Restored.',
      actions: [
        { kind: 'create_ticket', title: 'Redo second', body: 'Again.', restores: 'FG-2' },
        { kind: 'create_ticket', title: 'Ghost', body: 'x', restores: 'FG-99' },
      ],
    });

    await say(rig, 'restore FG-2');
    await rig.engine.tick();
    await rig.engine.idle();

    expect((await rig.ticket('FG-3')).priority).toBe(4);
    expect(await taken(rig)).toEqual([
      expect.objectContaining({
        result: 'done',
        summary: expect.stringContaining('restores FG-2, priority 4'),
      }),
      expect.objectContaining({ result: 'refused' }),
    ]);
  });

  it('shows the Director the owner controls and each ticket plan key, priority and waits', async () => {
    const rig = await makeRig();
    await twoCards(rig);
    rig.llm.script('card_chat', { reply: 'Hi.', actions: [] });

    await say(rig, 'what can I do?');
    await rig.engine.tick();
    await rig.engine.idle();

    const call = rig.llm.calls.filter((c) => c.name === 'card_chat').at(-1);
    const input = call?.input as {
      owner_controls: string[];
      allowed_actions: string[];
      tickets: Record<string, unknown>[];
    };

    expect(input.owner_controls.join('\n')).toContain('edit priority, dependencies');
    expect(input.allowed_actions).toContain('set_ticket_dependencies');
    expect(input.tickets[0]).toMatchObject({
      id: 'FG-1',
      plan_key: null,
      priority: 0,
      depends_on: [],
    });
  });
});

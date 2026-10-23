/**
 * Scenario: one cancel door for the owner and the Director, with a clean stop.
 *
 * Why: cancelling a running ticket must leave nothing behind and must say who cancelled and
 *   why. The Worker has to stop before its folder is removed (on Windows the process still holds
 *   files for a moment), a removal that still fails is retried by the next tick instead of waiting
 *   for a restart, and the Director may cancel only a ticket of its own card that is still open
 *   (d-0179), through the same door the owner uses, so dependents are never stranded.
 *
 * Pins: the owner's reason lands on the ticket's history line; the worktree is removed only after
 *   the Worker stopped; a held folder is retried by a later tick; `cancelTicket` is the same door
 *   (refuses a ticket others wait on); the Director's `cancel_ticket` cancels through
 *   `transition()` recording `by` the Director, is refused for another card's ticket, a finished
 *   ticket, and dependents without `cascade`; the Director is shown why a ticket was cancelled.
 * Depends on: helpers/rig, helpers/card-chat, helpers/planning-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { C1, history, say } from '#tests/helpers/card-chat.js';
import { cardEventsOf } from '#tests/helpers/escalation-rig.js';
import { intake, makeRig } from '#tests/helpers/rig.js';

async function running() {
  const rig = await makeRig();
  const id = await rig.request('Do the thing');
  await rig.tick();

  return { rig, id };
}

describe('the owner cancels a running ticket', () => {
  it('records who cancelled and the reason on the ticket history', async () => {
    const { rig, id } = await running();
    const ticket = await rig.ticket(id);

    const done = await rig.engine.actOnTicket(
      id,
      { action: 'cancel', reason: 'wrong approach' },
      'owner',
    );

    expect(done).toMatchObject({ status: 'done' });
    const states = await cardEventsOf(rig, ticket.card_id, 'ticket_state');
    const cancelled = states.find((e) => e.payload.to === 'cancelled');
    expect(cancelled?.payload.reason).toBe('You cancelled it: wrong approach');
  });

  it('removes the worktree only after the Worker has stopped', async () => {
    const { rig, id } = await running();
    const driver = rig.driver.driver;
    const stop = driver.cancel.bind(driver);
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    driver.cancel = async (handle) => {
      await held;
      await stop(handle);
    };

    const pending = rig.engine.actOnTicket(id, { action: 'cancel' }, 'owner');
    await new Promise((r) => setTimeout(r, 10));
    expect(rig.worktrees.removed).toEqual([]);

    release();
    await pending;
    expect(rig.worktrees.removed).toEqual(['/repo/.worktrees/FG-1']);
  });

  it('retries a held folder on a later tick, without a restart', async () => {
    const { rig, id } = await running();
    const { worktree } = await rig.ticket(id);
    rig.worktrees.failRemove = new Error('EBUSY: file is locked');
    await rig.engine.cancelTicket(id);
    expect((await rig.ticket(id)).worktree).toBe(worktree);

    rig.worktrees.failRemove = null;
    await rig.tick();

    expect(rig.worktrees.removed).toEqual([worktree]);
    expect((await rig.ticket(id)).worktree).toBeUndefined();
  });
});

/** Two tickets on one card where FG-2 waits for FG-1, set up through the Director's own actions. */
async function chain() {
  const { rig, id } = await running();
  rig.llm.script('card_chat', {
    reply: 'Filed.',
    actions: [
      { kind: 'create_ticket', title: 'Second', body: 'After the first.' },
      { kind: 'set_ticket_dependencies', ticket_id: 'FG-2', depends_on: [id] },
    ],
  });

  await say(rig, 'add a follow-up');
  await rig.tick();
  expect((await rig.ticket('FG-2')).blocked_by).toEqual([id]);

  return { rig, id };
}

describe('cancelTicket is the same door', () => {
  it('refuses a ticket that other tickets wait on', async () => {
    const { rig, id } = await chain();

    expect(await rig.engine.cancelTicket(id)).toBe(false);
    expect((await rig.ticket(id)).status).not.toBe('cancelled');
  });
});

describe('the Director cancels a ticket', () => {
  it('cancels through transition() and records the Director with its reason', async () => {
    const { rig, id } = await running();
    rig.llm.script('card_chat', {
      reply: 'Cancelled it.',
      actions: [{ kind: 'cancel_ticket', ticket_id: id, reason: 'you asked me to stop' }],
    });

    await say(rig, 'please cancel FG-1');
    await rig.tick();

    expect((await rig.ticket(id)).status).toBe('cancelled');
    expect(rig.driver.cancels).toEqual(['run-1']);
    const events = await history(rig);
    const state = events.find(
      (e) => e.kind === 'ticket_state' && e.payload.to === 'cancelled',
    );

    expect(state?.kind === 'ticket_state' && state.payload.reason).toBe(
      'The Director cancelled it: you asked me to stop',
    );

    expect(events.find((e) => e.kind === 'director_action')?.payload).toMatchObject({
      action: 'cancel_ticket',
      result: 'done',
    });
  });

  it('refuses a ticket of another card, an unknown one and a finished one', async () => {
    const rig = await makeRig();
    const mine = await rig.request('Mine');
    await rig.engine.ingest(intake({ payload: { text: 'Other card request' } }));
    await rig.tick();
    expect((await rig.ticket('FG-2')).card_id).not.toBe(C1);
    await rig.engine.cancelTicket(mine);

    rig.llm.script('card_chat', {
      reply: 'No.',
      actions: [
        { kind: 'cancel_ticket', ticket_id: 'FG-2', reason: 'x' },
        { kind: 'cancel_ticket', ticket_id: 'FG-99', reason: 'x' },
        { kind: 'cancel_ticket', ticket_id: mine, reason: 'x' },
      ],
    });

    await say(rig, 'cancel FG-2, FG-99 and FG-1');
    await rig.tick();

    expect((await rig.ticket('FG-2')).status).not.toBe('cancelled');
    const message = (await history(rig)).find((e) => e.kind === 'director_message');
    expect(message?.kind === 'director_message' && message.payload.actions_taken).toEqual(
      [
        expect.objectContaining({ result: 'refused' }),
        expect.objectContaining({ result: 'refused' }),
        expect.objectContaining({ result: 'refused' }),
      ],
    );
  });

  it('refuses when the owner message does not name the ticket', async () => {
    const { rig, id } = await running();
    rig.llm.script('card_chat', {
      reply: 'Done.',
      actions: [{ kind: 'cancel_ticket', ticket_id: id, reason: 'seemed right' }],
    });

    await say(rig, 'this is taking a while, what do you think?');
    await rig.tick();

    expect((await rig.ticket(id)).status).not.toBe('cancelled');
    const note = (await history(rig)).filter((e) => e.kind === 'note').at(-1);
    expect(JSON.stringify(note?.payload)).toContain('did not ask');
  });

  it('does not take FG-1 for FG-12, and takes the id in any case', async () => {
    const { rig, id } = await running();
    rig.llm.script(
      'card_chat',
      { reply: 'No.', actions: [{ kind: 'cancel_ticket', ticket_id: id, reason: 'x' }] },
      { reply: 'Yes.', actions: [{ kind: 'cancel_ticket', ticket_id: id, reason: 'x' }] },
    );

    await say(rig, 'cancel FG-12');
    await rig.tick();
    expect((await rig.ticket(id)).status).not.toBe('cancelled');

    await say(rig, 'please CANCEL fg-1.');
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('cancelled');
  });

  it('can never cancel on a turn no person triggered, even if the card text names the ticket', async () => {
    const rig = await makeRig();
    rig.llm.script('card_chat', {
      reply: 'Done.',
      actions: [{ kind: 'cancel_ticket', ticket_id: 'FG-1', reason: 'x' }],
    });

    // The card's own first message answers a `card_created` turn, not a person's chat message.
    const id = await rig.request('cancel FG-1 right away');
    await rig.tick();

    expect((await rig.ticket(id)).status).not.toBe('cancelled');
  });

  it('names the dependents when cascade is missing, and cancels the chain with it', async () => {
    const { rig, id } = await chain();
    rig.llm.script(
      'card_chat',
      {
        reply: 'No.',
        actions: [{ kind: 'cancel_ticket', ticket_id: id, reason: 'drop it' }],
      },
      {
        reply: 'Both gone.',
        actions: [
          { kind: 'cancel_ticket', ticket_id: id, reason: 'drop it', cascade: true },
        ],
      },
    );

    await say(rig, 'cancel FG-1');
    await rig.tick();
    expect((await rig.ticket(id)).status).not.toBe('cancelled');
    const refused = (await history(rig)).filter((e) => e.kind === 'note').at(-1);
    expect(JSON.stringify(refused?.payload)).toContain('FG-2');

    await say(rig, 'yes, cancel FG-1 and FG-2');
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('cancelled');
    expect((await rig.ticket('FG-2')).status).toBe('cancelled');
  });

  it('shows the Director why a ticket was cancelled, so it never re-files it unasked', async () => {
    const { rig, id } = await running();
    await rig.engine.actOnTicket(
      id,
      { action: 'cancel', reason: 'wrong approach' },
      'owner',
    );

    rig.llm.script('card_chat', { reply: 'Understood.', actions: [] });

    await say(rig, 'what happened to FG-1?');
    await rig.tick();

    const input = JSON.stringify(rig.llm.callsTo('card_chat').at(-1)!.input);
    expect(input).toContain('"cancel_reason":"You cancelled it: wrong approach"');
  });
});

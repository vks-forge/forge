/**
 * Scenario: cancelling from a wait, and sending finished work back.
 *
 * Why: cancelling is the owner's way out of every wait, and it must not strand work: a ticket
 *   other tickets wait on is refused unless the owner cancels the whole chain, and then every
 *   ticket goes through `transition()` with its waits closed. From a ticket's own page only Cancel
 *   (anything open) and Rework (finished work) exist; Rework sends the work back to its Worker
 *   with the owner's comment.
 *
 * Pins: Done-when 7 (cancel with dependents is refused naming them, with `cascade` cancels the
 *   chain, the escalation settled with `cascade`), cancel from a ticket page closing its waits,
 *   only cancel and rework on a ticket page, 404 for an unknown ticket, rework from review, and a cancel
 *   that removes the worktree and both branches, closes the PR and notes the last commit id (d-0179),
 *   carrying on when the host is down and leaving a merged PR alone.
 * Depends on: helpers/escalation-rig, helpers/planning-rig, helpers/verify-rig, vitest.
 */

import { describe, expect, it, vi } from 'vitest';
import { cardEventsOf, pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import { makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

// Every lane runs now, so a held lane has to be stubbed to exercise the hold path still kept for a lane without a runner.
vi.mock('#/domain/live-lanes.js', () => ({
  LIVE_LANES: ['express', 'standard'],
  isLive: (lane: string) => lane !== 'full',
}));

describe('cancelling', () => {
  async function heldWithDependent() {
    const rig = await planningRig();
    const plan = todoPlan();
    (plan['tickets'] as { lane: string }[])[0]!.lane = 'full';
    scriptTodo(rig, { write_plan: [plan] });
    const card = await planUntilDecision(rig);
    const [t1, t2] = await tickets(rig, card);
    const [row] = await pendingOf(rig, t1!.id, 'failure');

    return { rig, card, t1: t1!, t2: t2!, row: row! };
  }

  it('is refused with the dependents named, and cancels the chain through transition() with cascade', async () => {
    const { rig, card, t1, t2, row } = await heldWithDependent();
    expect(t1.status).toBe('waiting_human');
    expect(t2.blocked_by).toEqual([t1.id]);

    const refused = await rig.engine.actOnEscalation(
      row.id,
      { action: 'cancel' },
      'owner',
    );

    expect(refused).toEqual({ status: 'ticket_has_dependents', dependents: [t2.id] });
    expect((await rig.ticket(t1.id)).status).toBe('waiting_human');
    expect(await pendingOf(rig, t1.id, 'failure')).toHaveLength(1);

    const done = await rig.engine.actOnEscalation(
      row.id,
      { action: 'cancel', cascade: true },
      'owner',
    );

    expect(done.status).toBe('done');
    expect((await rig.ticket(t1.id)).status).toBe('cancelled');
    expect((await rig.ticket(t2.id)).status).toBe('cancelled');
    const settled = await rig.storage.transaction((tx) => tx.interactions.get(row.id));
    expect(settled).toMatchObject({
      status: 'answered',
      answer: { action: 'cancel', by: 'owner', cascade: true },
    });

    const states = await cardEventsOf(rig, card, 'ticket_state');
    expect(
      states.filter((e) => e.payload.to === 'cancelled').map((e) => e.payload.ticket_id),
    ).toEqual(expect.arrayContaining([t1.id, t2.id]));

    expect(
      states.filter((e) => e.payload.to === 'cancelled').map((e) => e.payload.reason),
    ).toEqual(Array(2).fill('You cancelled the stuck ticket and what waited on it'));
  });

  it('cancels a ticket from its own page and closes whatever wait it had', async () => {
    const { rig, t1, row } = await heldWithDependent();

    expect(await rig.engine.actOnTicket(t1.id, { action: 'cancel' }, 'owner')).toEqual({
      status: 'ticket_has_dependents',
      dependents: expect.any(Array),
    });

    const done = await rig.engine.actOnTicket(
      t1.id,
      { action: 'cancel', cascade: true },
      'owner',
    );

    expect(done).toEqual({ status: 'done', interaction: null });
    expect(await pendingOf(rig, t1.id)).toEqual([]);
    expect(
      (await rig.storage.transaction((tx) => tx.interactions.get(row.id)))?.status,
    ).toBe('cancelled');
  });

  it('offers only cancel and rework on a ticket page, and 404s an unknown ticket', async () => {
    const rig = await makeRig();
    const id = await rig.request('Do it');
    await rig.tick();

    expect(await rig.engine.actOnTicket(id, { action: 'retry' }, 'owner')).toMatchObject({
      status: 'action_not_offered',
    });

    expect(
      await rig.engine.actOnTicket(
        id,
        { action: 'rework', comment: 'again please' },
        'owner',
      ),
    ).toMatchObject({ status: 'action_not_offered' });

    expect(await rig.engine.actOnTicket('FG-99', { action: 'cancel' }, 'owner')).toEqual({
      status: 'not_found',
    });

    expect(await rig.engine.actOnTicket(id, { action: 'cancel' }, 'owner')).toMatchObject(
      {
        status: 'done',
      },
    );
  });
});

describe('finished work in review', () => {
  it('goes back to the Worker with the owner comment through transition()', async () => {
    const { rig } = await makeVerifyRig({ tier: 'B' });
    const id = await startAndFinish(rig);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('review');

    expect(
      await rig.engine.actOnTicket(
        id,
        { action: 'rework', comment: 'rename the flag' },
        'owner',
      ),
    ).toEqual({ status: 'done', interaction: null });

    expect((await rig.ticket(id)).status).toBe('in_progress');
    await rig.tick();
    const delta = JSON.stringify(rig.llm.callsTo('dispatch_prompt').at(-1)!.input);
    expect(delta).toContain('"kind":"rework"');
    expect(delta).toContain('rename the flag');
    expect(rig.driver.starts).toHaveLength(2);
  });
});

describe('cancelling a ticket that already has a branch and a PR', () => {
  async function inReview() {
    const { rig, host } = await makeVerifyRig({ tier: 'B' });
    const id = await startAndFinish(rig);
    await rig.tick();
    const ticket = await rig.ticket(id);
    expect(ticket.status).toBe('review');

    return { rig, host, ticket };
  }

  it('removes the worktree and both branches, closes the PR and notes the last commit', async () => {
    const { rig, host, ticket } = await inReview();
    const branch = ticket.branch as string;

    const done = await rig.engine.actOnTicket(ticket.id, { action: 'cancel' }, 'owner');

    expect(done).toEqual({ status: 'done', interaction: null });
    expect(rig.worktrees.removed).toContain(ticket.worktree);
    expect(rig.worktrees.removedBranches).toContain(branch);
    expect(host.calls).toContain(`closePr:${ticket.pr_number}`);
    expect(host.calls).toContain(`deleteBranch:${branch}`);
    const notes = await cardEventsOf(rig, ticket.card_id, 'note');
    const text = notes.map((e) => e.payload.text).join(' ');
    expect(text).toContain(ticket.id);
    expect(text).toContain(rig.worktrees.headSha);
  });

  it('keeps going when the host refuses to close the PR or delete the branch', async () => {
    const { rig, host, ticket } = await inReview();
    host.failNext('closePr', new Error('host is down'));
    host.failNext('deleteBranch', new Error('host is down'));

    const done = await rig.engine.actOnTicket(ticket.id, { action: 'cancel' }, 'owner');

    expect(done).toEqual({ status: 'done', interaction: null });
    expect(rig.worktrees.removed).toContain(ticket.worktree);
    expect(rig.worktrees.removedBranches).toContain(ticket.branch);
    expect((await rig.ticket(ticket.id)).worktree).toBeUndefined();
  });

  it('leaves the PR open when the PR already merged', async () => {
    const { rig, host, ticket } = await inReview();
    host.prState = 'merged';

    await rig.engine.actOnTicket(ticket.id, { action: 'cancel' }, 'owner');

    expect(host.count('closePr')).toBe(0);
  });
});

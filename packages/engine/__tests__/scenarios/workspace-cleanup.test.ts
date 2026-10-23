/**
 * Scenario: a ticket that ends without merging leaves no worktree or local branch behind.
 *
 * Why: a worktree holds an install folder of 150 MB or more, and a cancelled ticket's branch is
 *   work nobody wants. Every path that ends a ticket without a merge (the owner's cancel, a plan
 *   that replaces its not-started tickets) must remove both, and a removal that fails (a locked
 *   file on Windows) must be retried by the next start instead of being lost. Only the local branch
 *   goes: a pushed branch and an open PR belong to the remote.
 *
 * Pins: cancel removes the worktree and deletes the local branch; approving a re-plan does the
 *   same for the tickets it replaces; a failed removal keeps the folder on the ticket and the
 *   sweep at the next start finishes it and forgets it.
 * Depends on: helpers/rig, helpers/planning-rig, helpers/escalation-rig, vitest.
 */

import { describe, expect, it, vi } from 'vitest';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  cardOf,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';
import { makeRig } from '#tests/helpers/rig.js';

// A lane without a runner is held; stubbed so the held-lane ticket of the re-plan scenario exists.
vi.mock('#/domain/live-lanes.js', () => ({
  LIVE_LANES: ['express', 'standard'],
  isLive: (lane: string) => lane !== 'full',
}));

describe('cancel', () => {
  it('removes the worktree and deletes the local branch of the ticket', async () => {
    const rig = await makeRig();
    const id = await rig.request('Do the thing');
    await rig.tick();
    const { branch, worktree } = await rig.ticket(id);

    expect(await rig.engine.cancelTicket(id)).toBe(true);

    expect(rig.worktrees.removed).toEqual([worktree]);
    expect(rig.worktrees.removedBranches).toEqual([branch]);
    expect((await rig.ticket(id)).worktree).toBeUndefined();
  });

  it('keeps the folder on the ticket when removal fails, and the next start finishes it', async () => {
    const rig = await makeRig();
    const id = await rig.request('Do the thing');
    await rig.tick();
    const { branch, worktree } = await rig.ticket(id);

    rig.worktrees.failRemove = new Error('EBUSY: file is locked');
    await rig.engine.cancelTicket(id);

    expect(rig.worktrees.removed).toEqual([]);
    expect((await rig.ticket(id)).worktree).toBe(worktree);

    rig.worktrees.failRemove = null;
    const restarted = rig.restart('srv-b');
    await rig.tickOn(restarted);

    expect(rig.worktrees.removed).toEqual([worktree]);
    expect(rig.worktrees.removedBranches).toEqual([branch]);
    expect((await rig.ticket(id)).worktree).toBeUndefined();

    // Cleaned once: a later start finds nothing to do.
    await rig.tickOn(rig.restart('srv-c'));
    expect(rig.worktrees.removed).toHaveLength(1);
  });
});

describe('a plan that replaces its tickets', () => {
  it('removes the worktree and the local branch of a replaced ticket', async () => {
    const rig = await planningRig();
    const plan = (key: string, lane: string, files: string[]) => ({
      key,
      title: `Ticket ${key}`,
      body: `Do ${key}.`,
      acceptance: [`${key} works`],
      priority: 'normal',
      depends_on: [],
      lane,
      size: 'S',
      files,
    });

    const v1 = todoPlan({
      tickets: [plan('t1', 'full', ['src/a.ts']), plan('t2', 'express', ['src/b.ts'])],
    });

    const v2 = todoPlan({ tickets: [plan('t1', 'express', ['src/a.ts'])] });
    scriptTodo(rig, { write_plan: [v1, v2] });
    const card = await planUntilDecision(rig);
    await rig.tick();
    const [t1, t2] = await tickets(rig, card);
    const [hold] = await pendingOf(rig, t1!.id, 'failure');

    // t1 (held) once had a worktree: it was prepared before it was parked.
    const held = await rig.ticket(t1!.id);
    await rig.storage.transaction((tx) =>
      tx.tickets.updateTicketCas(held.id, held.status_version, {
        worktree: '/repo/.worktrees/held',
        branch: 'feat/held',
      }),
    );

    await rig.engine.actOnEscalation(
      hold!.id,
      { action: 'replan', comment: 'Smaller' },
      'owner',
    );

    await rig.tick();
    if ((await cardOf(rig, card)).phase === 'plan_ready') {
      expect((await rig.engine.approvePlan(card, 2, 'owner')).status).toBe('approved');
    }

    expect((await rig.ticket(t1!.id)).status).toBe('cancelled');
    expect(rig.worktrees.removed).toContain('/repo/.worktrees/held');
    expect(rig.worktrees.removedBranches).toContain('feat/held');
    // The running ticket was not replaced and keeps its tree.
    expect((await rig.ticket(t2!.id)).status).toBe('in_progress');
    expect(rig.worktrees.removed).not.toContain((await rig.ticket(t2!.id)).worktree);
  });

  it('keeps the tree of an omitted ticket that already has a run', async () => {
    const rig = await planningRig();
    const plan = (key: string, lane: string, files: string[]) => ({
      key,
      title: `Ticket ${key}`,
      body: `Do ${key}.`,
      acceptance: [`${key} works`],
      priority: 'normal',
      depends_on: [],
      lane,
      size: 'S',
      files,
    });

    const v1 = todoPlan({
      tickets: [
        plan('t1', 'full', ['src/a.ts']),
        plan('t2', 'express', ['src/b.ts']),
        plan('t3', 'express', ['src/c.ts']),
      ],
    });

    const v2 = todoPlan({ tickets: [plan('t1', 'express', ['src/a.ts'])] });
    scriptTodo(rig, { write_plan: [v1, v2] });
    const card = await planUntilDecision(rig);
    await rig.tick();
    const [t1, , t3] = await tickets(rig, card);
    const [hold] = await pendingOf(rig, t1!.id, 'failure');

    // t3 ran before (a retry put it back to planned) and has its tree.
    const stored = await rig.ticket(t3!.id);
    await rig.storage.transaction(async (tx) => {
      await tx.tickets.updateTicketCas(stored.id, stored.status_version, {
        status: 'planned',
        worktree: '/repo/.worktrees/ran',
        branch: 'feat/ran',
      });

      await tx.runs.insert({
        id: 'run-ran',
        ticket_id: stored.id,
        harness: 'scripted',
        driver_version: '1',
        cwd: '/tmp/x',
        lane: 'express',
        started_at: '2026-10-16T00:00:00.000Z',
        status: 'error',
        owner: 'srv',
      });
    });

    await rig.engine.actOnEscalation(
      hold!.id,
      { action: 'replan', comment: 'Smaller' },
      'owner',
    );

    await rig.tick();
    if ((await cardOf(rig, card)).phase === 'plan_ready') {
      await rig.engine.approvePlan(card, 2, 'owner');
    }

    expect((await rig.ticket(t3!.id)).status).toBe('planned');
    expect(rig.worktrees.removed).not.toContain('/repo/.worktrees/ran');
    expect(rig.worktrees.removedBranches).not.toContain('feat/ran');
  });
});

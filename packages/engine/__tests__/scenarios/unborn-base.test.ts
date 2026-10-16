/**
 * Scenario: a project whose repository has no commit yet waits for the user, not for a retry.
 *
 * Why: a project registered with "init only" (d-0124) has an empty repository, so there is
 *   nothing to cut a Worker's worktree from. Retrying every tick cannot fix that and a
 *   silent error loop would hide it. The ticket must stop in "Needs you" with the plain
 *   reason (make a first commit), start no Worker, and run normally once released after the
 *   user's commit. Any other failure to create a worktree keeps its old retry behaviour.
 *
 * Pins: an `invalid_input` failure from the worktree manager parks the ticket with the
 *   manager's message and starts nothing; a crash from the manager does not park it.
 * Depends on: helpers/rig, @forge/core, vitest.
 */

import { CrashError, InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';

describe('a base branch with no commit', () => {
  it('parks the ticket with the reason and starts no Worker', async () => {
    const rig = await makeRig();
    rig.worktrees.failCreate = new InvalidInputError(
      'base branch main has no commit yet; make a first commit in /x, then release this ticket',
    );

    const id = await rig.request('Add a readme');
    const report = await rig.tick();

    expect(report.dispatched).toEqual([]);
    expect(report.parked).toEqual([
      { ticketId: id, reason: expect.stringContaining('no commit yet') },
    ]);

    expect(await rig.ticket(id)).toMatchObject({
      status: 'waiting_human',
      blocked_reason: expect.stringContaining('make a first commit'),
    });

    expect(rig.driver.starts).toEqual([]);
  });

  it('does not park on a crash while creating the worktree', async () => {
    const rig = await makeRig();
    rig.worktrees.failCreate = new CrashError('disk full');

    const id = await rig.request('Add a readme');
    const report = await rig.tick();

    expect(report.parked).toEqual([]);
    expect((await rig.ticket(id)).status).not.toBe('waiting_human');
  });
});

/**
 * Scenario: the owner denies a call, several calls wait at once, and a fast owner answers early.
 *
 * Why: a refusal must reach the Worker as a refusal it cannot argue with: told in fixed words not
 *   to attempt the call or work around it. A Worker that asks three things must resume once, after
 *   the last answer, not three times, and a repeated ask must not nag the owner twice. An owner
 *   who answers while the Worker is still running must not be lost: the run parks at its own end
 *   and resumes at once with the answers.
 *
 * Pins: deny with a note reaches the resume brief; three items, de-duplication by key, the cap of
 *   five per run, one resume after the last answer; an answer given before the run settles parks
 *   the ticket and resumes it on the next tick.
 * Depends on: helpers/approval-rig, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  answer,
  delta,
  idOf,
  permissionsOf,
  raise,
  settleRun1,
  standardTicket,
} from '#tests/helpers/approval-rig.js';
import { makeRig } from '#tests/helpers/rig.js';

describe('deny', () => {
  it('tells the resumed Worker not to attempt or work around the call, with the owner note', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, 'pkg add evil'));
    await settleRun1(rig);

    const done = await answer(rig, item, 'deny', 'owner', 'not this one');
    expect(done.status).toBe('done');

    const report = await rig.tick();
    expect(report.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'resume' }]);

    const brief = delta(rig, 1);
    expect(brief).toContain('Denied');
    expect(brief).toContain('pkg add evil');
    expect(brief).toContain('do not attempt it or work around it');
    expect(brief).toContain('report_blocked');
    expect(brief).toContain('not this one');
  });

  it('does not raise a new item for the same call again', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const first = idOf(await raise(rig, 'pkg add evil'));

    const second = await raise(rig, 'pkg add evil');

    expect(idOf(second)).toBe(first);
    expect(second).toMatchObject({ created: false });
    expect(await permissionsOf(rig, id)).toHaveLength(1);
  });
});

describe('several items', () => {
  it('bounds a run at five pending items and refuses the sixth', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);

    for (let n = 1; n <= 5; n += 1) {
      expect((await raise(rig, `pkg add dep${n}`)).status).toBe('raised');
    }

    expect(await raise(rig, 'pkg add dep6')).toEqual({
      status: 'refused',
      reason: 'too_many_pending',
    });

    expect(await permissionsOf(rig, id)).toHaveLength(5);
  });

  it('resumes once, after the last of three answers, with all three in the brief', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const items = [
      idOf(await raise(rig, 'pkg add a')),
      idOf(await raise(rig, 'pkg add b')),
      idOf(await raise(rig, 'pkg add c')),
    ];

    await settleRun1(rig);
    expect((await rig.ticket(id)).status).toBe('waiting_human');

    await answer(rig, items[0] ?? '', 'allow_once');
    await answer(rig, items[1] ?? '', 'deny');
    expect((await rig.tick()).dispatched).toEqual([]);

    await answer(rig, items[2] ?? '', 'allow_once');
    const report = await rig.tick();

    expect(report.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'resume' }]);
    const brief = delta(rig, 1);
    expect(brief).toContain('pkg add a');
    expect(brief).toContain('pkg add b');
    expect(brief).toContain('pkg add c');
    expect(brief.indexOf('pkg add a')).toBeLessThan(brief.indexOf('pkg add c'));
  });

  it('parks on the oldest unanswered item while others are answered', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const first = idOf(await raise(rig, 'pkg add a'));
    await raise(rig, 'pkg add b');
    await answer(rig, first, 'allow_once');

    await settleRun1(rig);

    expect((await rig.ticket(id)).status).toBe('waiting_human');
    expect(rig.driver.starts).toHaveLength(1);
  });
});

describe('a fast owner', () => {
  it('answered before the run settles: the run parks and resumes at once with the answers', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, 'pkg add a'));

    // The ticket is in progress, so no wake yet: the run settles first.
    expect((await answer(rig, item, 'allow_once')).status).toBe('done');
    expect((await rig.tick()).dispatched).toEqual([]);

    // The settle tick parks the run and the same tick resumes it: the answers are already there.
    await settleRun1(rig);

    expect(rig.driver.starts[1]).toMatchObject({ runId: 'run-2', resume: 'sess-A' });
    expect((await rig.ticket(id)).assignee_run_id).toBe('run-2');
    expect(delta(rig, 1)).toContain('Allowed once');
  });
});

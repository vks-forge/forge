/**
 * Scenario: a run that cannot be resumed is retried, keeping its worktree.
 *
 * Why: a restart must never lose a ticket. When an interrupted run cannot be resumed (no
 *   session, a harness that cannot resume, a start that fails, a worktree that moved, a session
 *   that does not load) it is settled as a crash and the ticket is woken with `resume_failed`, so
 *   the next run continues in the same worktree from the changes already there (d-0092). A
 *   ticket that ended meanwhile is neither resumed nor retried. If any of this broke, a restart
 *   would leave a ticket assigned to nothing or restart its work from scratch.
 *
 * Pins: every fallback settles `settled`/`crash`, revokes the token and wakes with `resume_failed`;
 *   the retry is a new run with `retry_of` in the same worktree; a failure after real work is an
 *   ordinary failure; a terminal ticket is not resumed.
 * Depends on: helpers/rig, helpers/resume, helpers/scripted-driver, vitest.
 */

import { describe, expect, it } from 'vitest';
import { FAR, getRun, liveRun } from '#tests/helpers/resume.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

describe('a run that cannot be resumed is retried, keeping its worktree', () => {
  async function expectRetry(rig: Rig, id: string, engine: Rig['engine']): Promise<void> {
    expect(await getRun(rig, 'run-1')).toMatchObject({
      status: 'settled',
      error_family: 'crash',
    });

    expect((await getRun(rig, 'run-1'))?.ended_at).toBeDefined();
    expect(
      await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1')),
    ).toBeNull();

    const wakes = await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR));
    expect(wakes).toEqual([
      expect.objectContaining({
        ticket_id: id,
        kind: 'retry',
        reason: 'resume_failed',
        idempotency_key: 'run-1',
      }),
    ]);

    rig.clock.advance(10_001);
    const next = await rig.tickOn(engine);

    expect(next.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'retry' }]);
    expect(await getRun(rig, 'run-2')).toMatchObject({ retry_of: 'run-1' });
    expect(rig.worktrees.created).toHaveLength(1);
    expect(rig.worktrees.removed).toEqual([]);
    expect(rig.driver.starts.at(-1)?.resume).toBeUndefined();
  }

  it('when the harness refuses to start the resumed session', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();
    rig.driver.failNextStart(new Error('session not found'));

    const b = rig.restart('srv-b');
    const report = await b.tick();

    expect(report.resumed).toEqual([]);
    expect(report.resumeFailed).toEqual(['run-1']);
    await expectRetry(rig, id, b);
  });

  it('when an interrupted run has no session reference', async () => {
    const rig = await makeRig();
    const id = await rig.request('x');
    await rig.tick();
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    const b = rig.restart('srv-b');
    const report = await b.tick();

    expect(report.resumeFailed).toEqual(['run-1']);
    expect(report.resumed).toEqual([]);
    await expectRetry(rig, id, b);
  });

  it('when the driver cannot resume sessions', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();
    rig.driver.setCanResume(false);

    const b = rig.restart('srv-b');
    const report = await b.tick();

    expect(report.resumeFailed).toEqual(['run-1']);
    await expectRetry(rig, id, b);
  });

  it('when the resumed harness ends before it reports anything (the session did not load)', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    const b = rig.restart('srv-b');
    await b.tick();
    rig.driver.finish(
      'run-1',
      makeResult({ status: 'error', session: null, errorFamily: 'unknown' }),
    );

    await rig.flush();
    const report = await rig.tickOn(b);

    expect(report.resumeFailed).toEqual(['run-1']);
    await expectRetry(rig, id, b);
  });

  it('but a resumed harness that failed after working is an ordinary failure', async () => {
    const rig = await makeRig();
    await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    const b = rig.restart('srv-b');
    await b.tick();
    rig.driver.emit('run-1', { type: 'text', text: 'working' });
    await rig.flush();
    rig.driver.finish('run-1', makeResult({ status: 'error', errorFamily: 'crash' }));
    await rig.flush();
    const report = await rig.tickOn(b);

    expect(report.resumeFailed).toEqual([]);
    expect(await getRun(rig, 'run-1')).toMatchObject({ status: 'error' });
    const wakes = await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR));
    expect(wakes).toEqual([expect.objectContaining({ reason: 'crash' })]);
  });

  it('when the ticket worktree is no longer where the run left it', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();
    await rig.storage.transaction((tx) => tx.runs.update('run-1', { cwd: '/elsewhere' }));

    const report = await rig.restart('srv-b').tick();

    expect(report.resumeFailed).toEqual(['run-1']);
    expect(rig.driver.starts).toHaveLength(1);
    expect((await rig.ticket(id)).status).toBe('in_progress');
  });
});

describe('a ticket that ended while its run was interrupted', () => {
  it('is not resumed: the run is settled and nothing is retried', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();
    await rig.engine.cancelTicket(id);

    const report = await rig.restart('srv-b').tick();

    expect(report.resumed).toEqual([]);
    expect(rig.driver.starts).toHaveLength(1);
    expect((await getRun(rig, 'run-1'))?.status).toBe('settled');
    expect(await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR))).toEqual(
      [],
    );
  });
});

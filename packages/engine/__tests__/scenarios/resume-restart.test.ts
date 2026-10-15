/**
 * Scenario: runs survive a server restart (interrupt on shutdown, resume on start).
 *
 * Why: stopping Forge must not throw away a Worker's progress (d-0092). Shutdown marks live
 *   runs `interrupted`, keeping the harness session, the worktree and the receipts; the next
 *   start resumes each one from its session under a new generation, token and receipt secret
 *   (d-0100) instead of crash-settling it and starting over. If this broke, a routine restart
 *   would cost every in-flight ticket its work.
 *
 * Pins: interrupt keeps session, worktree and token; resume reuses the row with generation +1,
 *   a new token and cleared liveness; a crash with a session ref resumes, without one it
 *   crash-settles as before; repeated restarts keep counting.
 * Depends on: helpers/rig, helpers/resume, helpers/scripted-driver, @forge/tools (sha256Hex), vitest.
 */

import { sha256Hex } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { FAR, getRun, liveRun } from '#tests/helpers/resume.js';
import { makeRig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

describe('shutdown interrupts live runs', () => {
  it('marks the run interrupted with its session, cancels the harness and keeps token and worktree', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    const tokenBefore = await rig.storage.transaction((tx) =>
      tx.runTokens.getHash('run-1'),
    );

    await rig.engine.interruptRun('run-1');
    await rig.flush();

    expect(await getRun(rig, 'run-1')).toMatchObject({
      status: 'interrupted',
      resumable_session: 'sess-A',
    });

    expect((await getRun(rig, 'run-1'))?.interrupted_at).toBeDefined();
    expect((await getRun(rig, 'run-1'))?.ended_at).toBeUndefined();
    expect(rig.driver.cancels).toEqual(['run-1']);
    expect(await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1'))).toBe(
      tokenBefore,
    );

    expect(rig.worktrees.removed).toEqual([]);
    expect((await rig.ticket(id)).status).toBe('in_progress');
  });

  it('does not settle the cancelled run on the next tick of the same engine', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    const report = await rig.tick();

    expect(report.settled).toEqual([]);
    expect((await getRun(rig, 'run-1'))?.status).toBe('interrupted');
    expect((await rig.ticket(id)).status).toBe('in_progress');
    expect(await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR))).toEqual(
      [],
    );
  });

  it('leaves runs whose result already arrived to settle normally', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    rig.driver.finish('run-1', makeResult());
    await rig.flush();

    await rig.engine.interruptRun('run-1');
    await rig.tick();

    expect((await getRun(rig, 'run-1'))?.status).toBe('success');
    expect((await rig.ticket(id)).status).toBe('verifying');
  });

  it('ignores an unknown run id', async () => {
    const rig = await makeRig();

    await expect(rig.engine.interruptRun('run-404')).resolves.toBeUndefined();
  });
});

describe('start resumes interrupted runs (d-0092, d-0100)', () => {
  it('resumes from the session under generation 2 with a new token, on the same row', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    const oldToken = rig.driver.starts[0]?.env['FORGE_RUN_TOKEN'] ?? '';
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    const b = rig.restart('srv-b');
    const report = await b.tick();

    expect(report.resumed).toEqual(['run-1']);
    expect(report.crashed).toEqual([]);
    const req = rig.driver.starts.at(-1);
    expect(rig.driver.starts).toHaveLength(2);
    expect(req).toMatchObject({
      runId: 'run-1',
      resume: 'sess-A',
      generation: 2,
      cwd: '/repo/.worktrees/' + id,
    });

    const newToken = req?.env['FORGE_RUN_TOKEN'] ?? '';
    expect(newToken).not.toBe('');
    expect(newToken).not.toBe(oldToken);
    expect(await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1'))).toBe(
      sha256Hex(newToken),
    );

    const run = await getRun(rig, 'run-1');
    expect(run).toMatchObject({ status: 'running', owner: 'srv-b', generation: 2 });
    expect(run?.interrupted_at).toBeUndefined();
    expect(run?.resumable_session).toBeUndefined();
    expect(run?.hook_registered_at).toBeUndefined();
    expect(run?.ended_at).toBeUndefined();

    const ticket = await rig.ticket(id);
    expect(ticket).toMatchObject({ status: 'in_progress', assignee_run_id: 'run-1' });
    expect(rig.worktrees.removed).toEqual([]);
    expect(rig.worktrees.created).toHaveLength(1);
  });

  it('asks the Worker to continue, not to start over', async () => {
    const rig = await makeRig();
    await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    await rig.restart('srv-b').tick();

    expect(rig.driver.starts.at(-1)?.prompt).toMatch(/restarted/i);
    expect(rig.driver.starts.at(-1)?.prompt).toMatch(/continue/i);
  });

  it('clears a registered hook so the resumed process must register itself again', async () => {
    const rig = await makeRig();
    await liveRun(rig);
    await rig.storage.transaction((tx) =>
      tx.runs.update('run-1', { hook_registered_at: '2026-10-13T00:00:01.000Z' }),
    );

    await rig.engine.interruptRun('run-1');
    await rig.flush();
    await rig.restart('srv-b').tick();

    expect((await getRun(rig, 'run-1'))?.hook_registered_at).toBeUndefined();
  });

  it('finishes normally after a resume: the ticket moves to verifying on the one run row', async () => {
    const rig = await makeRig();
    const id = await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    const b = rig.restart('srv-b');
    await b.tick();
    rig.driver.finish('run-1', makeResult({ session: 'sess-A' }));
    await rig.flush();
    await rig.tickOn(b);

    expect(await getRun(rig, 'run-1')).toMatchObject({
      status: 'success',
      generation: 2,
    });

    expect((await rig.ticket(id)).status).toBe('verifying');
    expect(await rig.storage.transaction((tx) => tx.runs.listByTicket(id))).toHaveLength(
      1,
    );
  });

  it('counts generations across repeated restarts', async () => {
    const rig = await makeRig();
    await liveRun(rig);
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    const b = rig.restart('srv-b');
    await b.tick();
    await b.interruptRun('run-1');
    await rig.flush();
    await rig.restart('srv-c').tick();

    expect(await getRun(rig, 'run-1')).toMatchObject({ generation: 3, owner: 'srv-c' });
    expect(rig.driver.starts.at(-1)).toMatchObject({ generation: 3, resume: 'sess-A' });
  });

  it('resumes a run lost in a crash when its session was recorded (no shutdown ran)', async () => {
    const rig = await makeRig();
    await liveRun(rig);

    const report = await rig.restart('srv-b').tick();

    expect(report.resumed).toEqual(['run-1']);
    expect(rig.driver.starts.at(-1)).toMatchObject({ resume: 'sess-A', generation: 2 });
    expect(await getRun(rig, 'run-1')).toMatchObject({
      status: 'running',
      owner: 'srv-b',
    });
  });

  it('crash-settles a lost run that never reported a session, as before', async () => {
    const rig = await makeRig();
    const id = await rig.request('x');
    await rig.tick();

    const report = await rig.restart('srv-b').tick();

    expect(report.crashed).toEqual(['run-1']);
    expect(report.resumed).toEqual([]);
    expect(await getRun(rig, 'run-1')).toMatchObject({
      status: 'error',
      error_family: 'crash',
    });

    const wakes = await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR));
    expect(wakes).toEqual([
      expect.objectContaining({ ticket_id: id, kind: 'retry', reason: 'crash' }),
    ]);
  });

  it('does not touch a run the same server owns', async () => {
    const rig = await makeRig();
    await liveRun(rig);

    const report = await rig.tick();

    expect(report.resumed).toEqual([]);
    expect(rig.driver.starts).toHaveLength(1);
  });
});

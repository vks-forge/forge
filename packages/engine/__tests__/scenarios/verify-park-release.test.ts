/**
 * Scenario: a ticket parked during verify resumes verifying when a human releases it, and a
 * PR opened just before a crash is adopted instead of duplicated.
 *
 * Why: a verify fault no retry fixes (a merge conflict, auth) is not the Worker's fault.
 *   Charging it a rework would exhaust the automatic reworks early, and sending the released
 *   ticket back to Planned would start a new Worker that redoes finished work. The release
 *   must re-run publish, gates and merge on the same run. Separately, a crash between the
 *   host opening a PR and the ticket storing its number must not leave two PRs for one
 *   ticket on the next tick.
 *
 * Pins: verify park keeps rework_count; unparked returns to verifying; no second Worker
 *   run; merge succeeds after release; findPr adopts the PR so openPr runs once in total.
 * Depends on: helpers/verify-rig, src/tick/ticket-moves, @forge/core, vitest.
 */

import { CrashError, PolicyDeniedError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { moveTicket } from '#/tick/ticket-moves.js';
import { verdict } from '#tests/helpers/fake-git-host.js';
import type { Rig } from '#tests/helpers/rig.js';
import { finishRun, makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

const release = (rig: Rig, id: string) =>
  moveTicket(rig.storage, id, new Date(rig.clock.now()).toISOString(), () => ({
    events: [{ type: 'unparked' }],
  }));

describe('verify: park and release', () => {
  it('parks without spending a rework, and a release merges on the same run', async () => {
    const { rig, host } = await makeVerifyRig();
    host.failNext('merge', new PolicyDeniedError('merge conflict'));
    const id = await startAndFinish(rig);

    await rig.tick();
    const parked = await rig.ticket(id);
    expect(parked).toMatchObject({
      status: 'waiting_human',
      rework_count: 0,
      parked_from: 'verifying',
    });

    const moved = await release(rig, id);
    expect(moved.ok).toBe(true);
    expect(await rig.ticket(id)).toMatchObject({ status: 'verifying', rework_count: 0 });

    const report = await rig.tick();

    expect(report.dispatched).toEqual([]);
    expect(report.verified[0]).toMatchObject({ runId: 'run-1', outcome: 'merged' });
    expect((await rig.ticket(id)).status).toBe('done');
    expect(rig.driver.starts).toHaveLength(1);
    expect(host.count('openPr')).toBe(1);
    expect(host.count('merge')).toBe(2);
  });

  it('keeps the rework already spent by a gate failure when a later park is released', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(
      verdict('failed', [{ check: 'claims', message: 'bad' }]),
      verdict('passed'),
    );

    host.failNext('merge', new PolicyDeniedError('merge conflict'));
    const id = await startAndFinish(rig);

    await rig.tick();
    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });

    await finishRun(rig, 'run-2');
    await rig.tick();
    expect(await rig.ticket(id)).toMatchObject({
      status: 'waiting_human',
      rework_count: 1,
    });

    await release(rig, id);
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'done', rework_count: 1 });
    expect(rig.driver.starts).toHaveLength(2);
  });
});

describe('verify: duplicate PR after a crash', () => {
  it('adopts the PR the host already has instead of opening a second one', async () => {
    const { rig, host } = await makeVerifyRig();
    host.crashAfterOpen(new CrashError('server died after the host opened the PR'));
    const id = await startAndFinish(rig);

    await rig.tick();
    expect((await rig.ticket(id)).pr_number).toBeUndefined();

    const restarted = rig.restart('srv-a');
    rig.clock.advance(61_000);
    await restarted.tick();

    expect(await rig.ticket(id)).toMatchObject({
      status: 'done',
      pr_number: 42,
      pr_url: 'https://git.test/pr/42',
    });

    expect(host.count('openPr')).toBe(1);
    expect(host.count('findPr')).toBe(2);
  });
});

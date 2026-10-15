/**
 * Scenario: quota waits.
 *
 * Why: the harness runs on the user's own subscription (d-0097, d-0080). If a quota error
 *   failed ticket after ticket instead of parking the harness, the owner would come back to a
 *   board of parked work and a spent retry budget. The harness must be parked until the
 *   reset, the ticket must wait without being parked, and everything must resume on its own.
 *
 * Pins: a quota error parks the harness until the reset (or an hour when none was named),
 *   the ticket waits with a `quota_wait` wake that the hourly re-wake cap does not count,
 *   other tickets on that harness wait too, and everything resumes when the time passes; a
 *   configured fallback harness takes the ticket at once, an uninstalled one does not.
 * Depends on: helpers/rig, helpers/scheduling-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import { HOUR, addProject, quotaResult } from '#tests/helpers/scheduling-rig.js';

describe('quota waits', () => {
  it('parks the harness until the reset, makes the ticket wait, and resumes afterwards', async () => {
    const rig = await makeRig({ engine: { max_concurrent_per_project: 3 } });
    await addProject(rig, 'forge', 'FG');
    await rig.request('first');
    await rig.tick();
    const reset = new Date(rig.clock.now() + 2 * HOUR);
    await rig.request('second');
    rig.driver.finish('run-1', quotaResult(reset.toISOString()));
    await rig.flush();

    const parked = await rig.tick();

    const state = await rig.storage.transaction((tx) => tx.harnessState.list());
    const wakes = await rig.storage.transaction((tx) =>
      tx.wakeRequests.listDue('9999-12-31T23:59:59.999Z'),
    );

    const first = await rig.ticket('FG-1');
    expect(state).toMatchObject([
      { harness_id: 'scripted', paused_until: reset.toISOString() },
    ]);

    expect(wakes).toMatchObject([
      {
        ticket_id: 'FG-1',
        kind: 'retry',
        reason: 'quota_wait',
        not_before: reset.toISOString(),
      },
    ]);

    expect(first.status).toBe('in_progress');
    expect(parked.dispatched).toEqual([]);
    expect(await rig.engine.explainWait('FG-1')).toMatch(
      /^quota: scripted until \d\d:\d\d UTC$/,
    );

    expect(await rig.engine.explainWait('FG-2')).toMatch(
      /^quota: scripted until \d\d:\d\d UTC$/,
    );

    rig.clock.advance(2 * HOUR + 1_000);
    const resumed = await rig.tick();

    expect(resumed.dispatched.map((d) => [d.ticketId, d.kind])).toEqual([
      ['FG-1', 'retry'],
      ['FG-2', 'new'],
    ]);

    expect(await rig.storage.transaction((tx) => tx.harnessState.list())).toEqual([]);
  });

  it('waits an hour when the harness named no reset time', async () => {
    const rig = await makeRig();
    await addProject(rig, 'forge', 'FG');
    await rig.request('first');
    await rig.tick();
    const at = rig.clock.now();
    rig.driver.finish('run-1', quotaResult());
    await rig.flush();
    await rig.tick();

    const [row] = await rig.storage.transaction((tx) => tx.harnessState.list());

    expect(Date.parse(row!.paused_until)).toBe(at + HOUR);
    expect(row!.reason).toMatch(/no reset time/);
  });

  it('does not count a quota wait against the hourly re-wake cap or park the ticket', async () => {
    const rig = await makeRig({ engine: { rewake_cap: { max: 1, window_ms: HOUR } } });
    await addProject(rig, 'forge', 'FG');
    await rig.request('first');
    await rig.tick();
    for (let i = 1; i <= 3; i++) {
      rig.driver.finish(
        `run-${i}`,
        quotaResult(new Date(rig.clock.now() + 60_000).toISOString()),
      );

      await rig.flush();
      await rig.tick();
      rig.clock.advance(61_000);
      await rig.tick();
    }

    expect((await rig.ticket('FG-1')).status).toBe('in_progress');
  });

  it('sends the ticket to a configured fallback harness at once', async () => {
    const rig = await makeRig();
    rig.harnesses.add('other');
    await addProject(rig, 'forge', 'FG', { harness_fallbacks: ['other'] });
    await rig.request('first');
    await rig.tick();
    rig.driver.finish(
      'run-1',
      quotaResult(new Date(rig.clock.now() + 2 * HOUR).toISOString()),
    );

    await rig.flush();

    const report = await rig.tick();

    expect(report.dispatched.map((d) => [d.ticketId, d.kind])).toEqual([
      ['FG-1', 'retry'],
    ]);
  });

  it('keeps waiting when the fallback harness is not installed', async () => {
    const rig = await makeRig();
    await addProject(rig, 'forge', 'FG', { harness_fallbacks: ['ghost'] });
    await rig.request('first');
    await rig.tick();
    rig.driver.finish(
      'run-1',
      quotaResult(new Date(rig.clock.now() + 2 * HOUR).toISOString()),
    );

    await rig.flush();

    const report = await rig.tick();

    expect(report.dispatched).toEqual([]);
  });
});

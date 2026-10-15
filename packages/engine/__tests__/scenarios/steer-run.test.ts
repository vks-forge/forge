/**
 * Scenario: a person messages one live Worker directly (`engine.steerRun`).
 *
 * Why: d-0109 lets the user speak to a running Worker from its ticket page. The message must
 *   be on the run's event stream and in the durable inbox before the Worker sees it (so every
 *   open thread shows it and a crash cannot lose it), must reach the driver as a live `steer`
 *   with its inbox sequence, and must be refused, not faked, when the run is not live or the
 *   driver cannot steer. A driver that fails must leave the message visibly undelivered.
 *
 * Pins: happy path (inbox row, user_message event, driver call, delivered mark); runs that
 *   are unknown, finished or owned by another server are `not_live`; a driver without the
 *   `steer` mode is `unsupported` and nothing is stored; a driver that refuses with
 *   InvalidInputError is `unsupported`; any other driver failure throws and leaves the inbox
 *   row undelivered.
 * Depends on: helpers/rig, helpers/scripted-driver, vitest.
 */

import { InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

async function running(rig: Rig): Promise<void> {
  await rig.request('Fix it');
  await rig.tick();
}

const events = (rig: Rig) =>
  rig.storage.transaction((tx) => tx.runEvents.listByRun('run-1'));

const undelivered = (rig: Rig) =>
  rig.storage.transaction((tx) => tx.runInbox.listUndelivered('run-1'));

describe('steerRun', () => {
  it('stores the message, shows it on the stream, delivers it as a live steer and marks it delivered', async () => {
    const rig = await makeRig();
    await running(rig);

    const out = await rig.engine.steerRun('run-1', 'use the v2 API', 'vikash');

    expect(out).toEqual({ status: 'delivered', inboxSeq: 0 });
    expect(rig.driver.steers).toEqual([
      { runId: 'run-1', message: 'use the v2 API', mode: 'steer', inboxSeq: 0 },
    ]);

    expect(await events(rig)).toContainEqual(
      expect.objectContaining({
        type: 'user_message',
        inbox_seq: 0,
        mode: 'steer',
        author: 'vikash',
        text: 'use the v2 API',
      }),
    );

    expect(await undelivered(rig)).toEqual([]);
    expect(rig.llm.callsTo('steer_reply')).toEqual([]);
  });

  it('numbers successive messages and keeps the author of each', async () => {
    const rig = await makeRig();
    await running(rig);

    await rig.engine.steerRun('run-1', 'one', 'a');
    const second = await rig.engine.steerRun('run-1', 'two', 'b');

    expect(second).toEqual({ status: 'delivered', inboxSeq: 1 });
    const inbox = await rig.storage.transaction((tx) =>
      tx.runInbox.listUndelivered('run-1'),
    );

    expect(inbox).toEqual([]);
    expect(rig.driver.steers.map((s) => s.inboxSeq)).toEqual([0, 1]);
  });

  it('is not_live for an unknown run', async () => {
    const rig = await makeRig();
    await running(rig);

    expect(await rig.engine.steerRun('run-404', 'hi', 'a')).toEqual({
      status: 'not_live',
    });

    expect(rig.driver.steers).toEqual([]);
  });

  it('is not_live once the run has finished', async () => {
    const rig = await makeRig();
    await running(rig);
    rig.driver.finish('run-1', makeResult());
    await rig.flush();

    expect(await rig.engine.steerRun('run-1', 'hi', 'a')).toEqual({ status: 'not_live' });
    expect(rig.driver.steers).toEqual([]);
  });

  it('is not_live for a run another server owns', async () => {
    const rig = await makeRig();
    await running(rig);
    await rig.storage.transaction((tx) =>
      tx.runs.update('run-1', { owner: 'srv-other' }),
    );

    expect(await rig.engine.steerRun('run-1', 'hi', 'a')).toEqual({ status: 'not_live' });
    expect(rig.driver.steers).toEqual([]);
  });

  it('is unsupported, and stores nothing, when the driver does not declare steer', async () => {
    const rig = await makeRig();
    await running(rig);
    rig.driver.setSteerModes(['follow_up', 'interrupt']);

    expect(await rig.engine.steerRun('run-1', 'hi', 'a')).toEqual({
      status: 'unsupported',
    });

    expect(rig.driver.steers).toEqual([]);
    expect((await events(rig)).some((e) => e.type === 'user_message')).toBe(false);
    expect(await undelivered(rig)).toEqual([]);
  });

  it('is unsupported when the live session refuses the message', async () => {
    const rig = await makeRig();
    await running(rig);
    rig.driver.failSteer(
      new InvalidInputError('this adapter does not support live steering'),
    );

    expect(await rig.engine.steerRun('run-1', 'hi', 'a')).toEqual({
      status: 'unsupported',
    });

    expect(await undelivered(rig)).toHaveLength(1);
  });

  it('throws on any other driver failure and leaves the message undelivered', async () => {
    const rig = await makeRig();
    await running(rig);
    rig.driver.failSteer(new Error('pipe closed'));

    await expect(rig.engine.steerRun('run-1', 'hi', 'a')).rejects.toThrow('pipe closed');
    expect(await undelivered(rig)).toHaveLength(1);
    expect((await events(rig)).some((e) => e.type === 'user_message')).toBe(true);
  });
});

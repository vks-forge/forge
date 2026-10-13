/**
 * Scenario: steering a live run with a reply, and cancelling a ticket.
 *
 * Why: people watch runs and talk to them ("also update the docs", "stop"). A reply must
 *   reach the Worker in the right mode, be stored durably before delivery and be marked
 *   delivered only once the driver took it, and must never block the intake request on a
 *   model call. Cancelling must stop the live run, remove its worktree and leave no wake
 *   that could bring the ticket back (director-core.md §8).
 *
 * Pins: a reply to a ticket with a live run is queued, then on the next tick passes through
 *   the steer_reply step, the run inbox and driver.steer with its inbox sequence, and is
 *   marked delivered; a "none" verdict, an unsupported mode and a driver failure deliver
 *   nothing and are visible; a reply to a ticket with no run is ignored; cancelTicket
 *   cancels the run, removes the worktree, and the late settle does not retry or re-open;
 *   answering an unknown interaction is refused.
 * Depends on: helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { intake, makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const FAR = '9999-12-31T23:59:59.999Z';

async function running(rig: Rig): Promise<string> {
  const id = await rig.request('Fix it');
  await rig.tick();

  return id;
}

const reply = (rig: Rig, id: string, text = 'also update the docs') =>
  rig.engine.ingest(
    intake({ kind: 'reply', payload: { ticket_id: id, text } }, rig.clock.now()),
  );

describe('steering', () => {
  it('queues a reply, then delivers it through steer_reply, the run inbox and the driver', async () => {
    const rig = await makeRig();
    const id = await running(rig);

    expect(await reply(rig, id)).toEqual({ status: 'reply_queued', ticketId: id });
    expect(rig.driver.steers).toEqual([]);

    const report = await rig.tick();

    expect(report.steered).toEqual([{ ticketId: id, runId: 'run-1', mode: 'steer' }]);
    expect(rig.driver.steers).toEqual([
      {
        runId: 'run-1',
        message: 'Please also update the docs.',
        mode: 'steer',
        inboxSeq: 0,
      },
    ]);

    expect(rig.llm.callsTo('steer_reply')[0]!.opts.model).toBe('opus');
    expect(JSON.stringify(rig.llm.callsTo('steer_reply')[0]!.input)).toContain(
      'also update the docs',
    );

    const undelivered = await rig.storage.transaction((tx) =>
      tx.runInbox.listUndelivered('run-1'),
    );

    expect(undelivered).toEqual([]);
  });

  it('delivers nothing when the model says "none"', async () => {
    const rig = await makeRig();
    const id = await running(rig);
    rig.llm.script('steer_reply', { mode: 'none', text: '' });
    await reply(rig, id, 'thanks');
    const report = await rig.tick();
    expect(report.steered).toEqual([]);
    expect(rig.driver.steers).toEqual([]);
  });

  it('does not deliver a mode the driver cannot do', async () => {
    const rig = await makeRig();
    const id = await running(rig);
    rig.driver.setSteerModes(['follow_up']);
    await reply(rig, id);
    const report = await rig.tick();
    expect(report.steered).toEqual([]);
    expect(rig.driver.steers).toEqual([]);
    expect(rig.logs.some((l) => l.message.includes('cannot steer'))).toBe(true);
  });

  it('keeps the message undelivered and reports an error when the driver refuses it', async () => {
    const rig = await makeRig();
    const id = await running(rig);
    rig.driver.failSteer(new Error('pipe closed'));
    await reply(rig, id);
    const report = await rig.tick();
    expect(report.errors[0]?.message).toContain('pipe closed');
    const undelivered = await rig.storage.transaction((tx) =>
      tx.runInbox.listUndelivered('run-1'),
    );

    expect(undelivered).toHaveLength(1);
  });

  it('ignores a reply to a ticket with no live run and no pending question', async () => {
    const rig = await makeRig();
    const id = await rig.request('Not started yet');
    const r = await reply(rig, id);
    expect(r.status).toBe('ignored');
    expect(await reply(rig, 'FG-99')).toMatchObject({ status: 'ignored' });
  });
});

describe('cancel', () => {
  it('cancels the live run, removes the worktree and never retries', async () => {
    const rig = await makeRig();
    const id = await running(rig);

    expect(await rig.engine.cancelTicket(id)).toBe(true);
    expect(rig.driver.cancels).toEqual(['run-1']);
    expect(rig.worktrees.removed).toEqual(['/repo/.worktrees/FG-1']);
    expect((await rig.ticket(id)).status).toBe('cancelled');

    await rig.flush();
    const report = await rig.tick();
    expect(report.settled).toEqual([
      expect.objectContaining({ runId: 'run-1', status: 'cancelled' }),
    ]);

    expect(report.parked).toEqual([]);
    expect(await rig.storage.transaction((tx) => tx.wakeRequests.listDue(FAR))).toEqual(
      [],
    );

    expect((await rig.ticket(id)).status).toBe('cancelled');
    expect(await rig.engine.cancelTicket(id)).toBe(false);
    expect(await rig.engine.cancelTicket('FG-77')).toBe(false);
  });

  it('refuses to answer an interaction that does not exist', async () => {
    const rig = await makeRig();
    expect(await rig.engine.answerInteraction('nope', 'x')).toBe(false);
  });
});

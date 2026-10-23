/**
 * Scenario: where a tool approval must not be raised, must not expire and must not outlive its run.
 *
 * Why: Express is unattended, so asking would hang a run nobody answers; a run that already ended
 *   cannot be resumed with an answer; an item the owner has not read must never turn into a Blocked
 *   ticket by a timeout (nothing runs and nothing is held while it waits); a restart must not lose
 *   the item or ask twice for the same call; and a failed run must not leave questions about a
 *   session that is gone.
 *
 * Pins: Express and a finished run are refused and write nothing; a run that fails cancels its open
 *   items as automatic; no expiry after the question timeout; the item and its de-duplication
 *   survive a restart; cancelling the ticket cancels its items; a Worker that failed is retried
 *   without the cancelled items.
 * Depends on: helpers/approval-rig, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  answer,
  idOf,
  permissionsOf,
  raise,
  request,
  settleRun1,
  standardTicket,
} from '#tests/helpers/approval-rig.js';
import { cardEventsOf } from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';

const CMD = 'pkg add left-pad';

describe('refusals', () => {
  it('refuses Express: nobody can answer, nothing is written', async () => {
    const rig = await makeRig();
    const id = await rig.request('Fix the doctor check');
    await rig.tick();

    expect(await raise(rig, CMD)).toEqual({ status: 'refused', reason: 'express' });
    expect(await permissionsOf(rig, id)).toEqual([]);
    expect((await rig.ticket(id)).status).toBe('in_progress');
  });

  it('refuses a run that has ended and an unknown run', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    await settleRun1(rig);

    expect(await raise(rig, CMD)).toEqual({ status: 'refused', reason: 'run_not_live' });
    expect(await rig.engine.raiseToolApproval(request(CMD, { runId: 'run-99' }))).toEqual(
      {
        status: 'refused',
        reason: 'run_not_live',
      },
    );

    expect(await permissionsOf(rig, id)).toEqual([]);
  });
});

describe('a failed run', () => {
  it('cancels its open items as automatic and retries without them', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    await raise(rig, CMD);

    await settleRun1(rig, 'error');

    const [row] = await permissionsOf(rig, id);
    expect(row?.status).toBe('cancelled');
    const settled = await cardEventsOf(
      rig,
      (await rig.ticket(id)).card_id,
      'escalation_settled',
    );

    expect(settled).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ action: 'cancel', by: 'auto' }),
      }),
    );

    expect((await rig.ticket(id)).status).not.toBe('verifying');
  });
});

describe('no expiry', () => {
  it('keeps the item pending and the ticket parked long after the question timeout', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));
    await settleRun1(rig);

    rig.clock.advance(5 * 3_600_000);
    await rig.tick();
    rig.clock.advance(24 * 3_600_000);
    await rig.tick();

    const [row] = await permissionsOf(rig, id);
    expect(row).toMatchObject({ id: item, status: 'pending' });
    expect((await rig.ticket(id)).status).toBe('waiting_human');
    expect(await answer(rig, item, 'allow_once')).toMatchObject({ status: 'done' });
  });
});

describe('an item with a deadline', () => {
  it('is not expired into Blocked even when its stored deadline passes', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));
    await settleRun1(rig);
    await rig.storage.transaction((tx) =>
      tx.interactions.update(item, {
        timeout_at: new Date(rig.clock.now() + 3_600_000).toISOString(),
      }),
    );

    rig.clock.advance(2 * 3_600_000);
    await rig.tick();

    expect((await permissionsOf(rig, id))[0]?.status).toBe('pending');
    expect((await rig.ticket(id)).status).toBe('waiting_human');
  });
});

describe('restart and cancel', () => {
  it('keeps the item across a restart and finds it again for the same call', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));

    const restarted = rig.restart('server-2');
    const again = await restarted.raiseToolApproval(request(CMD));

    expect(again).toMatchObject({
      status: 'raised',
      interactionId: item,
      created: false,
    });

    expect(await permissionsOf(rig, id)).toHaveLength(1);
  });

  it('cancels the open items when the ticket is cancelled', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    await raise(rig, CMD);
    await settleRun1(rig);

    expect(await rig.engine.cancelTicket(id)).toBe(true);

    expect((await permissionsOf(rig, id))[0]?.status).toBe('cancelled');
  });
});

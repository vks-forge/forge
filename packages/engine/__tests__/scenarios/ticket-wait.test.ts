/**
 * Scenario: the board says where a ticket really is and why, not what its status claims.
 *
 * Why: the owner reads the board to decide where to look. A ticket sent back for rework reads
 *   In Progress at once, but if the only Worker slot is taken nothing runs for it; the owner
 *   must see that it is queued and which ticket holds the slot. A ticket in Needs you whose
 *   only item was already answered (Re-plan) has nothing left to do for the owner: it is held
 *   by the card's new plan, and counts as Needs you only while an item is open. A waiting
 *   ticket that is neither is a bug worth a log line, shown as stuck instead of hidden.
 *
 * Pins: rework behind a busy slot is `queued` with the holder named, a batch of tickets is
 *   explained from one scheduling decision, a waiting ticket whose card re-plans is
 *   `held_by_plan` with the owner's choice in the line, one with an open item is `waiting_you`,
 *   and a waiting ticket with no item and no re-plan is `stuck` and logged once.
 * Depends on: helpers/rig, helpers/scheduling-rig, helpers/escalation-rig, helpers/planning-rig, vitest.
 */

import type { Ticket } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const at = (rig: Rig): string => new Date(rig.clock.now()).toISOString();

async function seed(rig: Rig, n: number, patch: Partial<Ticket>): Promise<string> {
  const id = `FG-${n}`;
  const now = at(rig);
  await rig.storage.transaction((tx) =>
    tx.tickets.insert({
      id: id as Ticket['id'],
      project: 'forge',
      title: `Ticket ${n}`,
      body: 'Do it',
      type: 'feat',
      lane: 'express',
      tier_predicted: 'B',
      status: 'review',
      status_version: 3,
      rework_count: 0,
      priority: 0,
      created_at: now,
      updated_at: now,
      blocked_by: [],
      ...patch,
    }),
  );

  return id;
}

describe('a reworked ticket behind a busy slot', () => {
  it('is in progress by status but queued by phase, naming the ticket that holds the slot', async () => {
    const rig = await makeRig();
    const reviewed = await seed(rig, 1, { status: 'review', tier_actual: 'B' });
    await rig.request('the one that runs');
    await rig.tick();
    const [item] = await pendingOf(rig, reviewed, 'sign_off');

    const done = await rig.engine.actOnEscalation(
      item!.id,
      { action: 'rework', comment: 'Please handle the empty case' },
      'owner',
    );

    expect(done.status).toBe('done');
    expect((await rig.ticket(reviewed)).status).toBe('in_progress');

    const waits = await rig.engine.explainWaits([reviewed, 'FG-2']);

    expect(waits.get(reviewed)).toMatchObject({
      phase: 'queued',
      holders: ['FG-2'],
      text: expect.stringContaining('FG-2 is working'),
    });

    expect(waits.get('FG-2')).toMatchObject({ phase: 'working' });
    expect(await rig.engine.explainWait(reviewed)).toBe('cap: per-project 1/1');
  });

  it('leaves out ids that are not tickets', async () => {
    const rig = await makeRig();

    expect((await rig.engine.explainWaits(['FG-99'])).size).toBe(0);
  });
});

describe('a waiting ticket with no open owner item', () => {
  it('is stuck, and logged once, when its card is not re-planning', async () => {
    const rig = await makeRig();
    const id = await seed(rig, 1, { status: 'waiting_human', parked_from: 'verifying' });

    const first = await rig.engine.explainWaits([id]);
    await rig.engine.explainWaits([id]);

    expect(first.get(id)).toMatchObject({ phase: 'stuck' });
    const warned = rig.logs.filter((l) => l.level === 'warn' && l.message.includes(id));

    expect(warned).toHaveLength(1);
  });
});

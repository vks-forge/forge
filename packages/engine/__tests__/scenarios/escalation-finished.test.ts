/**
 * Pins the start-up backfill for finished work and held tickets.
 *
 * Why: tickets already waiting when Forge starts (in Review or Needs sign-off, or held with a reason
 *   but no item) must not be left with a bare status and nothing to click: the owner's screens show
 *   one item per wait, and an upgrade is exactly when old waits exist. The first tick gives each
 *   finished ticket its sign-off item (cause from its tier), and each held ticket its decision (cause
 *   read off the reason), once; a second start finds them and adds nothing, and a ticket that already
 *   has a wait is left alone.
 *
 * Pins: a ticket in review gets a sign_off item (tier B, tier A as the owner's stage, tier C for
 *   needs_signoff) at the owner stage; a ticket held with `findings_hold:` or `scope_drift:` gets a
 *   decision of that cause; a second start adds nothing; a ticket with a pending wait is skipped.
 * Depends on: helpers/rig, @forge/core, vitest.
 */

import type { Ticket } from '@forge/core';
import { describe, expect, it } from 'vitest';
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
      lane: 'full',
      tier_predicted: 'A',
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

const itemsOf = (rig: Rig, id: string) =>
  rig.storage.transaction((tx) => tx.interactions.listByTicket(id));

describe('backfill of finished work', () => {
  it('raises one sign_off item per ticket waiting for a name, with the cause its tier says', async () => {
    const rig = await makeRig();
    const b = await seed(rig, 1, { status: 'review', tier_actual: 'B' });
    const a = await seed(rig, 2, { status: 'review', tier_actual: 'A' });
    const c = await seed(rig, 3, { status: 'needs_signoff', tier_actual: 'C' });

    await rig.tick();

    const payloads = await Promise.all(
      [b, a, c].map(async (id) => (await itemsOf(rig, id)).map((i) => i.payload)),
    );

    expect(payloads[0]).toEqual([
      expect.objectContaining({ kind: 'sign_off', cause: 'tier_b', tier: 'B' }),
    ]);

    expect(payloads[1]).toEqual([
      expect.objectContaining({ kind: 'sign_off', cause: 'owner_stage', tier: 'A' }),
    ]);

    expect(payloads[2]).toEqual([
      expect.objectContaining({ kind: 'sign_off', cause: 'tier_c', tier: 'C' }),
    ]);

    const [row] = await itemsOf(rig, b);

    expect(row).toMatchObject({ kind: 'sign_off', status: 'pending' });
    expect(row?.escalated_at).toBeDefined();
  });

  it('adds nothing on a second start, and leaves a ticket that already has a wait alone', async () => {
    const rig = await makeRig();
    const id = await seed(rig, 1, { status: 'review', tier_actual: 'B' });
    const waiting = await seed(rig, 2, { status: 'review', tier_actual: 'B' });
    await rig.storage.transaction((tx) =>
      tx.interactions.insert({
        id: 'int-existing',
        ticket_id: waiting,
        kind: 'sign_off',
        payload: {
          kind: 'sign_off',
          cause: 'tier_b',
          tier: 'B',
          summary: 'already here',
          checks: {
            passed: 1,
            counts: { critical: 0, high: 0, medium: 0, low: 0 },
            overrides: 0,
          },
        },
        status: 'pending',
        asked_at: at(rig),
        escalated_at: at(rig),
        timeout_at: '9999-12-31T00:00:00.000Z',
      }),
    );

    await rig.tick();
    const second = rig.restart('srv-b');
    await rig.tickOn(second);

    expect(await itemsOf(rig, id)).toHaveLength(1);
    expect((await itemsOf(rig, waiting)).map((i) => i.id)).toEqual(['int-existing']);
  });
});

describe('backfill of held tickets', () => {
  it.each([
    [
      'findings_hold: Review found blocking findings and holds the merge for you.',
      'findings_hold',
    ],
    [
      'scope_drift: the change is bigger than planned (1 file outside the plan).',
      'scope_drift',
    ],
  ] as const)('gives a ticket held with "%s" a %s decision', async (reason, cause) => {
    const rig = await makeRig();
    const id = await seed(rig, 1, {
      status: 'waiting_human',
      parked_from: 'verifying',
      blocked_reason: reason,
      rework_count: 2,
    });

    await rig.tick();

    const [row] = await itemsOf(rig, id);

    expect(row).toMatchObject({ kind: 'decision', status: 'pending' });
    expect(row?.payload).toMatchObject({
      kind: 'decision',
      cause,
      rework: { count: 2, cap: 2 },
    });
  });
});

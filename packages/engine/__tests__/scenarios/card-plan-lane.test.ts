/**
 * Scenario: the lane a plan's tickets are filed in, from the plan to the filed ticket.
 *
 * Why: the planner picks each ticket's lane and approval may only raise it. In the eval a short
 *   Express ticket came out Standard on text the planner never wrote and nobody could see why
 *   (T2). The owner must be able to read the reason on the card, and a lane the owner chose in
 *   the plan editor must stand against the automatic size checks (d-0177), while a protected
 *   path still forces Full (d-0012).
 *
 * Pins: a raise on more than three files is written on the card with its reason; long acceptance
 *   criteria do not raise a short body; an owner lane edit is stored as `lane_by_owner` in the
 *   next owner version and approval honours it; a Tier C file overrides the owner lane.
 * Depends on: helpers/planning-rig, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  eventsOf,
  planOf,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const FOUR_FILES = ['a', 'b', 'c', 'd'].map((n) => `src/${n}.ts`);

const onePlan = (files: string[], over: Record<string, unknown> = {}) =>
  todoPlan({
    tickets: [
      {
        key: 't1',
        title: 'The change',
        body: 'Do it.',
        acceptance: ['it works'],
        priority: 'normal',
        depends_on: [],
        lane: 'express',
        size: 'S',
        files,
        ...over,
      },
    ],
  });

/** The Director asks the owner instead of approving, so the owner edits and approves. */
const ownerDecides = {
  approve_plan: [{ decision: 'ask_owner', questions: ['Is this the right lane?'] }],
};

const laneNotes = async (rig: Rig, id: Parameters<typeof eventsOf>[1]) =>
  (await eventsOf(rig, id, 'note'))
    .map((e) => String(e.payload.text))
    .filter((t) => t.includes('Lane raised'));

describe('lane at approval', () => {
  it('raises Express to Standard on more than three files and writes the reason on the card', async () => {
    const rig = await planningRig();
    scriptTodo(rig, { write_plan: [onePlan(FOUR_FILES)] });

    const id = await planUntilDecision(rig);

    const [t] = await tickets(rig, id);
    expect(t?.lane).toBe('standard');
    const notes = await laneNotes(rig, id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain(
      'Lane raised from express to standard: 4 files predicted (> 3)',
    );
  });

  it('keeps a short Express ticket Express however long its acceptance list is', async () => {
    const rig = await planningRig();
    const acceptance = Array.from(
      { length: 90 },
      (_, i) => `criterion number ${i} holds`,
    );

    scriptTodo(rig, { write_plan: [onePlan(['src/a.ts'], { acceptance })] });

    const id = await planUntilDecision(rig);

    const [t] = await tickets(rig, id);
    expect(t?.lane).toBe('express');
    expect(t?.body.length).toBeGreaterThan(2000);
    expect(await laneNotes(rig, id)).toEqual([]);
  });
});

describe('an owner-set lane', () => {
  it('is stored in the next owner version and survives the size checks at approval', async () => {
    const rig = await planningRig();
    scriptTodo(rig, { write_plan: [onePlan(FOUR_FILES)], ...ownerDecides });
    const id = await planUntilDecision(rig);

    const edited = await rig.engine.editPlanTickets(
      id,
      1,
      { tickets: [{ key: 't1', lane: 'express' }] },
      'vikash',
    );

    expect(edited.status).toBe('edited');
    expect((await planOf(rig, id))?.tickets[0]).toMatchObject({
      lane: 'express',
      lane_by_owner: true,
    });

    expect((await rig.engine.approvePlan(id, 2, 'vikash')).status).toBe('approved');
    const [t] = await tickets(rig, id);
    expect(t?.lane).toBe('express');
    expect(await laneNotes(rig, id)).toEqual([]);
  });

  it('does not set the flag on a ticket the owner did not edit', async () => {
    const rig = await planningRig();
    scriptTodo(rig, { ...ownerDecides });
    const id = await planUntilDecision(rig);

    await rig.engine.editPlanTickets(
      id,
      1,
      { tickets: [{ key: 't1', lane: 'standard' }] },
      'vikash',
    );

    const plan = await planOf(rig, id);
    expect(plan?.tickets[0]?.lane_by_owner).toBe(true);
    expect(plan?.tickets[1]?.lane_by_owner).toBeUndefined();
  });

  it('still runs a Tier C ticket in Full, whatever lane the owner chose', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      write_plan: [onePlan(['.github/workflows/ci.yml'])],
      ...ownerDecides,
    });

    const id = await planUntilDecision(rig);
    await rig.engine.editPlanTickets(
      id,
      1,
      { tickets: [{ key: 't1', lane: 'express' }] },
      'vikash',
    );

    expect((await rig.engine.approvePlan(id, 2, 'vikash')).status).toBe('approved');
    const [t] = await tickets(rig, id);
    expect(t).toMatchObject({ lane: 'full', tier_predicted: 'C' });
    expect((await laneNotes(rig, id))[0]).toContain('tier-C path touched');
  });
});

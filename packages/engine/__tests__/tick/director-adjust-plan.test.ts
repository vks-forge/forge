/**
 * Pins what the planner is shown about pipelines and which of its ops survive when the plan is written.
 *
 * Why: what the planner writes is untrusted (the plan was drafted from repository text a stranger may have written),
 *   so every op is run against the ticket's lane when the plan is written: an op the rules refuse is dropped and named
 *   under the plan's risks, and only the ops that hold stay on the plan the owner approves. A removal makes the
 *   pipeline lighter than the owner's lane, so only the owner approves it (d-0141 item 6). The planner must see the
 *   lanes, roster, locks and scorecards it needs to choose, or be told it may not choose at all; the owner may take
 *   an op off a ticket before approving, never add one.
 *
 * Pins: Done-when 4 (the plan input holds roster, lanes, locks and scorecards; an invalid op is dropped into the
 *   risks; a remove op waits for the owner even under director_or_user) and the switch (off: the planner is told,
 *   its ops are dropped) and the owner's edit that removes an op.
 * Depends on: helpers/adjust-rig, helpers/planning-rig, @forge/core, vitest.
 */

import type { PlanVersion } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  addSecurity,
  planWith,
  planned,
  setProject,
  withSecurity,
} from '#tests/helpers/adjust-rig.js';
import { cardOf, eventsOf, planOf, planningRig } from '#tests/helpers/planning-rig.js';

interface PipelinesInput {
  adjust: boolean;
  playbook: { id: string };
  lanes: Record<string, unknown>;
  locked: Record<string, string[]>;
  roster: { id: string }[];
  scorecards: unknown[];
}

describe('writing the plan', () => {
  it('shows the planner the lanes, the roster, the locks and the scorecards', async () => {
    const rig = await planningRig();
    await setProject(rig, withSecurity);
    await planned(rig, planWith([]));

    const input = rig.llm.callsTo('write_plan')[0]!.input as {
      pipelines: PipelinesInput;
    };

    const { pipelines } = input;

    expect(pipelines.adjust).toBe(true);
    expect(Object.keys(pipelines.lanes)).toEqual(['express', 'standard', 'full']);
    expect(pipelines.locked['standard']).toEqual(['g1', 'merge']);
    expect(pipelines.locked['full']).toEqual(['g1', 'sign-off', 'merge']);
    expect(pipelines.roster.map((r) => r.id)).toContain('security-reviewer');
    expect(Array.isArray(pipelines.scorecards)).toBe(true);
    expect(pipelines.playbook.id).toBe('adjust-pipeline');
  });

  it('keeps only the ops that hold and names the dropped ones under the plan risks', async () => {
    const rig = await planningRig();
    await setProject(rig, withSecurity);
    const card = await planned(
      rig,
      planWith([
        { op: 'remove', stage_id: 'g1', reason: 'Skip the gate to save time here.' },
        { op: 'remove', stage_id: 'merge', reason: 'Nobody needs a merge for this.' },
        addSecurity,
        {
          op: 'swap',
          stage_id: 'reviewer',
          agent: 'ghost',
          reason: 'Use someone who is not there.',
        },
      ]),
    );

    const plan = (await planOf(rig, card)) as PlanVersion;
    const [t] = plan.tickets;

    expect(t?.pipeline?.ops).toEqual([addSecurity]);
    const risks = plan.verification.risks.filter((r) =>
      r.startsWith('Pipeline change dropped for t1'),
    );

    expect(risks).toHaveLength(3);
    expect(risks.join(' ')).toMatch(/g1/);
    expect(risks.join(' ')).toMatch(/locked/i);
    // Only valid ops stand, so the Director may still approve it.
    expect((await cardOf(rig, card)).phase).toBe('in_progress');
  });

  it('a removal makes the pipeline lighter: the owner approves, even under director_or_user', async () => {
    const rig = await planningRig();
    const card = await planned(
      rig,
      planWith([
        {
          op: 'remove',
          stage_id: 'reviewer',
          reason: 'A one-line typo fix needs no review.',
        },
      ]),
    );

    const c = await cardOf(rig, card);

    expect(c.phase).toBe('plan_ready');
    expect(c.needs_you).toBe(true);
    expect(rig.llm.callsTo('approve_plan')).toEqual([]);
    const ask = (await eventsOf(rig, card, 'needs_you')).at(-1)?.payload;

    expect(ask?.reason).toContain(
      't1 runs a lighter pipeline than its lane (removes reviewer)',
    );

    expect(
      (await eventsOf(rig, card, 'plan_ready'))[0]?.payload.auto_approve_eligible,
    ).toBe(false);
  });

  it('with the switch off the planner is told so and any op it writes is dropped', async () => {
    const rig = await planningRig();
    await setProject(rig, {
      ...withSecurity,
      director: { pipelines: { adjust: false } },
    });

    const card = await planned(rig, planWith([addSecurity]));
    const input = rig.llm.callsTo('write_plan')[0]!.input as { pipelines: unknown };
    const plan = (await planOf(rig, card)) as PlanVersion;

    expect(input.pipelines).toEqual({ adjust: false });
    expect(plan.tickets[0]?.pipeline).toBeUndefined();
    expect(plan.verification.risks.join(' ')).toContain('switched off');
  });

  it('an owner edit may take an op off a ticket, never add one', async () => {
    const rig = await planningRig();
    await setProject(rig, withSecurity);
    const card = await planned(
      rig,
      planWith([
        addSecurity,
        {
          op: 'remove',
          stage_id: 'reviewer',
          reason: 'A one-line typo fix needs no review.',
        },
      ]),
    );

    const out = await rig.engine.editPlanTickets(
      card,
      1,
      { tickets: [{ key: 't1', drop_pipeline_ops: [1] }] },
      'owner',
    );

    expect(out.status).toBe('edited');
    const next = (await planOf(rig, card, 2)) as PlanVersion;

    expect(next.author).toBe('owner');
    expect(next.tickets[0]?.pipeline?.ops).toEqual([addSecurity]);
    // Without the removal the plan no longer needs the owner for being lighter.
    const all = await rig.engine.editPlanTickets(
      card,
      2,
      { tickets: [{ key: 't1', drop_pipeline_ops: [0] }] },
      'owner',
    );

    expect(all.status).toBe('edited');
    expect(
      ((await planOf(rig, card, 3)) as PlanVersion).tickets[0]?.pipeline,
    ).toBeUndefined();
  });
});

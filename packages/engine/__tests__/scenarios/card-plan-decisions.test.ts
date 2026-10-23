/**
 * Scenario: the written plan must keep the owner's answers, and say each risk once.
 *
 * Why: in the eval the owner chose one thing in the grill and the plan's non-goals quietly said
 *   the opposite (T6), and the same three risks were listed eleven ways (T1). The planner now
 *   accounts for every answer (`decision_checks`), the engine retries an answer that skips one,
 *   stores any conflict on the plan so the floor stops the Director's own approval, and merges
 *   risks without near-duplicates, so the owner approves on a plan that agrees with them.
 *
 * Pins: a missing check index is retried once with the validation message; a `conflict` verdict
 *   and a negating non-goal both fail the floor with a named reason and leave the card at Needs
 *   you with no approve step; honoured answers pass; known risks reach the planner and a
 *   reworded risk is not repeated.
 * Depends on: helpers/planning-rig, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  cardOf,
  eventsOf,
  pick,
  planOf,
  planUntilDecision,
  planningRig,
  scriptTodo,
  todoPlan,
} from '#tests/helpers/planning-rig.js';

const honoured = [{ index: 0, status: 'honoured', where: 'scope' }];

describe('decision_checks', () => {
  it('retries once with the missing index named when the planner skips an answer', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      write_plan: [
        todoPlan({ decision_checks: [] }),
        todoPlan({ decision_checks: honoured }),
      ],
    });

    const id = await planUntilDecision(rig);

    const calls = rig.llm.callsTo('write_plan');
    expect(calls).toHaveLength(2);
    expect(String(pick(calls[1]?.input, 'previous_error'))).toContain('missing index 0');
    expect((await planOf(rig, id))?.version).toBe(1);
    expect((await eventsOf(rig, id, 'plan_approved'))[0]?.payload.by).toBe('director');
  });

  it('shows the planner each answer by position and the risks already known', async () => {
    const rig = await planningRig();

    await planUntilDecision(rig);

    const input = rig.llm.callsTo('write_plan')[0]?.input;
    expect(pick(input, 'grill_decisions')).toHaveLength(1);
    expect(pick(input, 'known_risks')).toEqual([]);
  });

  it('stops at Needs you when the planner reports an answer it could not keep', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      write_plan: [
        todoPlan({
          decision_checks: [
            { index: 0, status: 'conflict', where: 't2 stores todos on a server' },
          ],
        }),
      ],
    });

    const id = await planUntilDecision(rig);

    const card = await cardOf(rig, id);
    expect(card.phase).toBe('plan_ready');
    expect(card.needs_you).toBe(true);
    expect(rig.llm.callsTo('approve_plan')).toEqual([]);
    expect((await planOf(rig, id))?.decision_conflicts).toEqual([
      {
        question: 'Where are todos stored?',
        answer: 'Local storage',
        where: 't2 stores todos on a server',
      },
    ]);

    const ask = (await eventsOf(rig, id, 'needs_you')).at(-1)?.payload;
    expect(ask?.reason).toContain('Plan conflicts with your answer "Local storage"');
    expect(ask?.reason).toContain('t2 stores todos on a server');
    expect(ask?.actions).toContain('approve_plan');
  });

  it('flags a plan whose non-goal negates an answer it called honoured', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      write_plan: [
        todoPlan({
          non_goals: ['No local storage, todos live on a server'],
          decision_checks: honoured,
        }),
      ],
    });

    const id = await planUntilDecision(rig);

    expect(rig.llm.callsTo('approve_plan')).toEqual([]);
    const conflicts = (await planOf(rig, id))?.decision_conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.where).toContain('non_goals: No local storage');
    expect((await cardOf(rig, id)).needs_you).toBe(true);
  });

  it('lets the owner approve a flagged plan anyway: a conflict only stops the Director', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      write_plan: [
        todoPlan({
          decision_checks: [{ index: 0, status: 'conflict', where: 't2' }],
        }),
      ],
    });

    const id = await planUntilDecision(rig);

    expect((await rig.engine.approvePlan(id, 1, 'vikash')).status).toBe('approved');
  });
});

describe('risks and assumptions', () => {
  it('hands the planner the survey and verify risks once and keeps a reworded risk out of the plan', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      card_survey: [
        { read_requests: [{ op: 'read', path: 'package.json' }] },
        {
          findings: {
            summary: 'A bare project.',
            predicted_lane: 'standard',
            predicted_files: ['src/store.ts', 'src/ui.ts'],
            risks: ['No tests cover the sync path'],
          },
        },
      ],
      verify: [
        {
          findings: {
            summary: 'ok',
            blast_radius: 'two files',
            risks: [
              'Migration may lock the todos table during deploy',
              'Risk: no tests cover the sync path.',
            ],
          },
        },
      ],
      write_plan: [
        todoPlan({
          risks: [
            'Risk: the migration may lock the todos table during the deploy.',
            'No tests cover the sync path!',
            'The provider rate limit is unknown',
          ],
          assumptions: ['single user', 'Assumption: Single user.'],
        }),
      ],
    });

    const id = await planUntilDecision(rig);

    const known = pick(rig.llm.callsTo('write_plan')[0]?.input, 'known_risks');
    expect(known).toEqual([
      'Migration may lock the todos table during deploy',
      'Risk: no tests cover the sync path.',
    ]);

    const plan = await planOf(rig, id);
    expect(plan?.verification.risks).toEqual([
      'Migration may lock the todos table during deploy',
      'Risk: no tests cover the sync path.',
      'The provider rate limit is unknown',
    ]);

    expect(plan?.assumptions.filter((a) => /single user/i.test(a))).toHaveLength(1);
  });
});

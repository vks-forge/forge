/**
 * Scenario: the approval floor is a question for approval time only, and a paused step is not "thinking".
 *
 * Why: the floor compares the plan's files with what changed in the repo since the plan was
 *   verified. Once the plan is approved the card's own tickets merge those very files, so asking
 *   again would tell a finished card "Floor check did not pass". And a Director step that stopped
 *   for the owner (its budget ran out) or failed must say so in the card's history; a step that
 *   only ever started looks like the Director is still working while it waits on the owner.
 *
 * Pins: before approval the floor is computed and `floor_frozen_at` is null; after approval the
 *   floor is null and `floor_frozen_at` is the approval time, whatever the repo did since; a step
 *   that hit its budget and a step that failed each write `step_finished` with the outcome
 *   `paused_for_you` / `failed`, so every `step_started` has a finish.
 * Depends on: helpers/planning-rig, helpers/scripted-llm, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  createPlanCard,
  eventsOf,
  planUntilDecision,
  planningRig,
} from '#tests/helpers/planning-rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';

describe('the plan floor after approval', () => {
  it('is computed before approval and frozen (null, with the approval time) afterwards', async () => {
    const rig = await planningRig();
    rig.repo.changed = ['src/store.ts'];
    const id = await planUntilDecision(rig);

    const before = await rig.engine.cardPlans(id);
    expect(before).toMatchObject({
      status: 'ok',
      floor: { pass: false },
      floor_frozen_at: null,
    });

    expect((await rig.engine.approvePlan(id, 1, 'vikash')).status).toBe('approved');
    rig.repo.changed = ['src/store.ts', 'src/index.ts'];

    const after = await rig.engine.cardPlans(id);
    const approvedAt = (await eventsOf(rig, id, 'plan_approved'))[0]?.at;
    expect(after).toMatchObject({
      status: 'ok',
      floor: null,
      floor_frozen_at: approvedAt,
    });

    expect(approvedAt).toBeDefined();
  });
});

describe('a planning step that stops without a result', () => {
  it.each([
    [
      'runs out of its budget',
      { kind: 'budget', message: 'Reached maximum budget' },
      'paused_for_you',
    ],
    ['fails', { kind: 'invalid_output', message: 'not valid JSON' }, 'failed'],
  ] as const)('writes step_finished when it %s', async (_n, error, outcome) => {
    const rig = await planningRig();
    rig.llm.script('card_survey', fail(error));

    const id = await createPlanCard(rig);
    await rig.tick();

    const started = await eventsOf(rig, id, 'step_started');
    const finished = await eventsOf(rig, id, 'step_finished');
    expect(finished.at(-1)?.payload).toMatchObject({
      step_id: started.at(-1)?.payload.step_id,
      outcome,
    });
  });
});

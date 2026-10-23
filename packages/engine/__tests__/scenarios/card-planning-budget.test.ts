/**
 * Scenario: a planning step that runs out of the per-step budget goes to the owner, not into a retry loop.
 *
 * Why: the claude CLI's own system prompt and cache write cost about $0.50 on opus, so a step
 *   capped at that can never finish. Retrying it after the stale claim re-spends the same money
 *   forever (d-0143 says cost warns, never blocks; d-0135 says no dead ends). A budget failure
 *   is not transient: it needs the owner to raise the cap, so the card shows Needs you with
 *   the two ways out (raise the cap, retry the step), the queued turn is released, and only the
 *   owner's retry runs the step again. Other failures keep the quiet retry.
 *
 * Pins: needs_you with raise_step_budget + retry_step and a copy that names the step and the
 *   amount; the turn is not claimed again after the stale window; retry re-queues the same step
 *   and the flow carries on; retry is refused on a card that is not stuck; the default cap is
 *   high enough for the claude CLI; a crash still retries on its own.
 * Depends on: helpers/planning-rig, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  answerWith,
  cardOf,
  createPlanCard,
  eventsOf,
  planningRig,
} from '#tests/helpers/planning-rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';

const BUDGET = { kind: 'budget', message: 'Reached maximum budget ($0.5)' } as const;

const SURVEY_OK = {
  findings: { summary: 'ok', predicted_lane: 'standard' },
};

/** A survey that opens a file first: the project has tracked files, so a survey that read none is sent back. */
const SURVEY_READS = { read_requests: [{ op: 'read', path: 'package.json' }] };

describe('a planning step over its budget', () => {
  it('raises Needs you with both actions and a note that says what to do', async () => {
    const rig = await planningRig({ engine: { step_budget_usd: 0.5 } });
    rig.llm.script('card_survey', fail(BUDGET), SURVEY_OK);

    const id = await createPlanCard(rig);
    await rig.tick();

    const card = await cardOf(rig, id);
    const raised = await eventsOf(rig, id, 'needs_you');
    const notes = await eventsOf(rig, id, 'note');

    expect(card.needs_you).toBe(true);
    expect(raised.at(-1)?.payload.actions).toEqual(['raise_step_budget', 'retry_step']);
    expect(raised.at(-1)?.payload.reason).toBe(
      'The Director\'s per-step budget ($0.50) is too small for "Survey the code".',
    );

    expect(raised.at(-1)?.payload).toMatchObject({
      kind: 'step_budget',
      title: 'The Director ran out of step budget',
      items: ['Survey the code: the per-step budget is $0.50.'],
    });

    expect(notes.at(-1)?.payload.text).toBe(
      'The Director\'s step budget ($0.50) ran out during "Survey the code". Raise it in Settings → Limits, then Retry.',
    );
  });

  it('does not take the turn again after the stale window', async () => {
    const rig = await planningRig();
    rig.llm.script('card_survey', fail(BUDGET), SURVEY_OK);

    const id = await createPlanCard(rig);
    await rig.tick();
    expect(rig.llm.callsTo('card_survey')).toHaveLength(1);

    rig.clock.advance(11 * 60 * 1000);
    await rig.tick();
    await rig.tick();

    expect(rig.llm.callsTo('card_survey')).toHaveLength(1);
    expect((await cardOf(rig, id)).needs_you).toBe(true);
  });

  it('re-queues the same step on retry and carries on to the grill question', async () => {
    const rig = await planningRig();
    rig.llm.script('card_survey', fail(BUDGET), SURVEY_READS, SURVEY_OK);

    const id = await createPlanCard(rig);
    await rig.tick();

    const out = await rig.engine.retryPlanningStep(id, 'owner');
    expect(out.status).toBe('retried');

    await rig.tick();

    const card = await cardOf(rig, id);
    const finished = await eventsOf(rig, id, 'step_finished');

    // The failed call, then the retried step's read round and its findings.
    expect(rig.llm.callsTo('card_survey')).toHaveLength(3);
    expect(finished.map((e) => e.payload.step_id)).toContain('survey');
    // The grill asks its first question: the card waits on the owner for an answer now.
    expect((await eventsOf(rig, id, 'grill_question')).length).toBe(1);
    expect(card.needs_you).toBe(true);

    await answerWith(rig, id);
    await rig.tick();

    expect((await cardOf(rig, id)).phase).toBe('in_progress');
  });

  it('refuses a retry on a card that is not stuck', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    // The card waits on a grill answer, not on a failed step.
    expect((await rig.engine.retryPlanningStep(id, 'owner')).status).toBe(
      'phase_mismatch',
    );

    expect((await rig.engine.retryPlanningStep('FG-C42', 'owner')).status).toBe(
      'not_found',
    );
  });

  it('passes the default budget to the model, enough for the claude CLI', async () => {
    const rig = await planningRig();
    await createPlanCard(rig);
    await rig.tick();

    expect(rig.llm.callsTo('card_survey')[0]?.opts.budgetUsd).toBe(2);
  });

  it('still retries a crash on its own after the stale window', async () => {
    const rig = await planningRig();
    rig.llm.script(
      'card_survey',
      fail({ kind: 'crash', message: 'died' }),
      SURVEY_READS,
      SURVEY_OK,
    );

    const id = await createPlanCard(rig);
    await rig.tick();

    expect(await eventsOf(rig, id, 'needs_you')).toEqual([]);

    rig.clock.advance(11 * 60 * 1000);
    await rig.tick();

    expect(rig.llm.callsTo('card_survey')).toHaveLength(3);
  });
});

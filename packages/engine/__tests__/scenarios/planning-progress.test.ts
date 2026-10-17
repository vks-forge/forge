/**
 * Scenario: the owner sees the Director working while a planning step runs.
 *
 * Why: a planning step is a model call of up to a minute. All the events of DCP-C2's turn
 *   (`step_started`, `step_finished`, `grill_question`, `needs_you`) carried one timestamp, the
 *   moment the tick began, so the card page could not tell "thinking" from "stuck" and the
 *   history lied about how long each step took. The step must be announced and committed before
 *   its model call, and each event stamped with the clock at its own write.
 *
 * Pins: `step_started` is committed (readable) while the model call is in flight, with no
 *   `step_finished` yet; the step's result events are stamped after the call, not at the tick's
 *   start; the grill question and `needs_you` carry the time of their own write; a step that
 *   failed and is retried ends with exactly one `step_finished`.
 * Depends on: helpers/planning-rig, helpers/scripted-llm, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  createPlanCard,
  eventsOf,
  events,
  planningRig,
} from '#tests/helpers/planning-rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';

const MINUTE = 60_000;

describe('planning progress is live', () => {
  it('commits step_started before the model call and stamps results after it', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    const startedAt = new Date(rig.clock.now()).toISOString();
    let seenDuringCall: string[] = [];
    rig.llm.during('card_survey', async () => {
      seenDuringCall = (await events(rig, id)).map((e) => e.kind);
      rig.clock.advance(MINUTE);
    });

    await rig.tick();

    // Visible while the model was thinking: started, not finished.
    expect(seenDuringCall).toContain('step_started');
    expect(seenDuringCall).not.toContain('step_finished');

    const started = (await eventsOf(rig, id, 'step_started'))[0]!;
    const finished = (await eventsOf(rig, id, 'step_finished'))[0]!;
    expect(started.at).toBe(startedAt);
    expect(Date.parse(finished.at)).toBeGreaterThanOrEqual(
      Date.parse(startedAt) + MINUTE,
    );
  });

  it('stamps the grill question and the needs-you flag when they are written, not when the tick began', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    const startedAt = new Date(rig.clock.now()).toISOString();
    rig.llm.during('grill_turn', async () => {
      rig.clock.advance(2 * MINUTE);
    });

    await rig.tick();

    const question = (await eventsOf(rig, id, 'grill_question'))[0]!;
    const needs = (await eventsOf(rig, id, 'needs_you'))[0]!;
    const grillStart = (await eventsOf(rig, id, 'step_started')).find(
      (e) => e.payload.step_kind === 'grill',
    )!;

    expect(Date.parse(grillStart.at)).toBeLessThan(Date.parse(startedAt) + 2 * MINUTE);
    expect(Date.parse(question.at)).toBeGreaterThanOrEqual(
      Date.parse(startedAt) + 2 * MINUTE,
    );

    expect(Date.parse(needs.at)).toBeGreaterThanOrEqual(
      Date.parse(startedAt) + 2 * MINUTE,
    );
  });

  it('leaves a failed step retryable and records exactly one step_finished for it', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    rig.llm.script('card_survey', fail({ kind: 'crash', message: 'process died' }), {
      findings: { summary: 'Fine.', predicted_lane: 'standard' },
    });

    await rig.tick();
    expect((await eventsOf(rig, id, 'step_finished')).length).toBe(0);

    rig.clock.advance(11 * MINUTE);
    await rig.tick();

    const surveyIds = (await eventsOf(rig, id, 'step_finished'))
      .filter((e) => e.payload.step_kind === 'survey')
      .map((e) => e.payload.step_id);

    expect(surveyIds).toHaveLength(1);
  });
});

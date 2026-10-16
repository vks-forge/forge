/**
 * Scenario: the Director plans a card end to end (survey, grill, verify, enhance, plan, approve).
 *
 * Why: this is the point of the card-first flow (d-0128, d-0130): "i want to create a TODO
 *   application" must not become a ticket. The Director reads the code (through the engine,
 *   recording what it read), asks the owner one question at a time, verifies, enhances, writes
 *   a versioned plan, and either approves it behind the floor or hands it to the owner; only
 *   then do ordered tickets with dependencies exist. Every step is recorded with the config
 *   version it ran under, a restart must resume the grill where it stopped, and a Discussion
 *   card must never be planned.
 *
 * Pins: the full happy path with ordered tickets, priorities and dependencies; the events in
 *   order with files read and config version; one question at a time and no model call while
 *   waiting; restart mid-grill; the zero-question path; Discussion cards untouched; a failing
 *   step is retried later without dropping the card.
 * Depends on: helpers/planning-rig, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  answerWith,
  cardOf,
  createPlanCard,
  events,
  eventsOf,
  kinds,
  pick,
  planOf,
  planningRig,
  scriptTodo,
  tickets,
} from '#tests/helpers/planning-rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';
import { intake } from '#tests/helpers/rig.js';

describe('planning a card', () => {
  it('runs survey, grill, verify, enhance, plan and approval and files ordered tickets', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);

    await rig.tick();

    // The first tick runs the survey (with a read round) and stops at the grill question.
    let card = await cardOf(rig, id);
    expect(card.phase).toBe('grilling');
    expect(card.needs_you).toBe(true);
    expect(await tickets(rig, id)).toEqual([]);

    await answerWith(rig, id);
    await rig.tick();

    card = await cardOf(rig, id);
    expect(card.phase).toBe('in_progress');
    expect((await planOf(rig, id))?.version).toBe(1);

    const filed = await tickets(rig, id);
    expect(filed.map((t) => t.title)).toEqual(['Ticket t1', 'Ticket t2']);
    expect(filed.map((t) => t.priority)).toEqual([2, 1]);
    expect(filed[1]?.blocked_by).toEqual([filed[0]?.id]);
    // The first ticket has no blocker, so the same tick may already have dispatched it; the second waits for it.
    expect(['planned', 'in_progress']).toContain(filed[0]?.status);
    expect(filed[1]?.status).toBe('planned');

    expect((await eventsOf(rig, id, 'plan_approved'))[0]?.payload).toMatchObject({
      version: 1,
      by: 'director',
      ticket_ids: filed.map((t) => t.id),
    });
  });

  it('records every step with its files read and the config version, in order', async () => {
    const rig = await planningRig();
    await rig.config.append({
      scope: 'company',
      doc: { director: { house_rules: 'Be brief.' } },
      author: 'test',
      reason: 'rules',
      expectedVersion: 0,
    });

    const id = await createPlanCard(rig);
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    const log = await events(rig, id);
    const steps = log
      .filter((e) => e.kind === 'step_started' || e.kind === 'step_finished')
      .map((e) => `${e.kind}:${(e.payload as { step_id: string }).step_id}`);

    expect(steps).toEqual([
      'step_started:survey',
      'step_finished:survey',
      'step_started:grill',
      'step_finished:grill',
      'step_started:verify',
      'step_finished:verify',
      'step_started:enhance',
      'step_finished:enhance',
      'step_started:write_plan',
      'step_finished:write_plan',
      'step_started:approve',
      'step_finished:approve',
    ]);

    const finished = await eventsOf(rig, id, 'step_finished');
    const survey = finished.find((e) => e.payload.step_id === 'survey')?.payload;
    expect(survey?.files_read).toEqual([
      {
        path: 'package.json',
        bytes: Buffer.byteLength(rig.repo.files['package.json'] ?? ''),
      },
    ]);

    expect(finished.every((e) => e.payload.config_version === 1)).toBe(true);
    expect((await planOf(rig, id))?.config_version).toBe(1);
    expect((await planOf(rig, id))?.verification.files_read).toEqual(['package.json']);
  });

  it('asks one question at a time, with the open-point count, and makes no model call while waiting', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);

    await rig.tick();
    const callsAfterFirst = rig.llm.calls.length;
    await rig.tick();
    await rig.tick();

    expect(rig.llm.calls).toHaveLength(callsAfterFirst);
    const asked = await eventsOf(rig, id, 'grill_question');
    expect(asked).toHaveLength(1);
    expect(asked[0]?.payload).toMatchObject({
      question_id: 'q1',
      text: 'Where are todos stored?',
      allow_other: true,
      open_points: 1,
    });

    expect(asked[0]?.payload.options.filter((o) => o.recommended)).toHaveLength(1);
    expect((await eventsOf(rig, id, 'needs_you'))[0]?.payload.actions).toEqual([
      'answer',
    ]);
  });

  it('feeds the structured grill state, playbook, house rules and project rules into each step', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    const turn = rig.llm.callsTo('grill_turn')[1]?.input;
    expect(pick(turn, 'grill.answers')).toEqual([
      expect.objectContaining({ question: 'Where are todos stored?', by: 'owner' }),
    ]);

    expect(pick(turn, 'playbook.id')).toBe('plan-grill');
    expect(pick(turn, 'project_rules.decisions.0.id')).toBe('d-0001');
    expect(pick(turn, 'project_rules.repo_rules')).toEqual([
      expect.objectContaining({ path: 'CLAUDE.md' }),
    ]);

    const verify = rig.llm.callsTo('verify')[0]?.input;
    expect(
      (pick(verify, 'previous_steps') as { step_id: string }[]).map((s) => s.step_id),
    ).toEqual(['survey', 'grill']);
  });

  it('skips the question entirely on the zero-question path', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      grill_turn: [
        { done: true, done_reason: 'zero_question', open_points: 0, assumptions: [] },
      ],
    });

    const id = await createPlanCard(rig);
    await rig.tick();

    expect(await eventsOf(rig, id, 'grill_question')).toEqual([]);
    expect((await eventsOf(rig, id, 'grill_done'))[0]?.payload.reason).toBe(
      'zero_question',
    );

    expect((await cardOf(rig, id)).phase).toBe('in_progress');
  });

  it('resumes a grill after a restart: the new engine reads the stored state', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    const restarted = rig.restart('srv-b');
    const answered = await restarted.answerGrill(
      id,
      { question_id: 'q1', option_id: 'o1' },
      'owner',
    );

    expect(answered.status).toBe('answered');
    await rig.tickOn(restarted);

    expect((await cardOf(rig, id)).phase).toBe('in_progress');
    expect(await kinds(rig, id)).toContain('plan_approved');
  });

  it('never plans a Discussion card: card chat only', async () => {
    const rig = await planningRig();
    await rig.engine.ingest(
      intake({ payload: { text: 'Should we move to pnpm?', card_type: 'discussion' } }),
    );

    await rig.tick();

    expect(rig.llm.callsTo('card_survey')).toEqual([]);
    expect(rig.llm.callsTo('card_chat')).toHaveLength(1);
    expect((await cardOf(rig, 'FG-C1' as never)).phase).toBe('grilling');
  });

  it('retries a failed step later without dropping the card or writing a half plan', async () => {
    const rig = await planningRig();
    rig.llm.script('card_survey', fail({ kind: 'crash', message: 'process died' }), {
      findings: { summary: 'ok', predicted_lane: 'standard' },
    });

    const id = await createPlanCard(rig);
    await rig.tick();

    expect(await eventsOf(rig, id, 'step_finished')).toEqual([]);
    expect((await eventsOf(rig, id, 'note'))[0]?.payload.text).toMatch(/survey/i);

    await rig.tick();
    expect(rig.llm.callsTo('card_survey')).toHaveLength(1);

    rig.clock.advance(11 * 60 * 1000);
    await rig.tick();

    expect((await eventsOf(rig, id, 'step_finished')).length).toBeGreaterThan(0);
    expect((await cardOf(rig, id)).phase).toBe('grilling');
  });
});

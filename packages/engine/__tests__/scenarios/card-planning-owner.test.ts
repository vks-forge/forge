/**
 * Scenario: what the owner can do during planning.
 *
 * Why: the grill is a conversation the owner steers: answer an option or in their own words,
 *   take the Director's recommendations, or cut the questions short (d-0130); a backfilled card
 *   must offer Start planning; an unanswered question is nudged and never answered for them.
 *
 * Pins: answer validation (not open, both or neither of option and text, unknown option);
 *   a chat message answers the open question; the two shortcuts and what they record;
 *   Start planning and conversion of a Discussion; the 24 h nudge.
 * Depends on: helpers/planning-rig, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  answerWith,
  cardOf,
  createPlanCard,
  eventsOf,
  kinds,
  planOf,
  planningRig,
} from '#tests/helpers/planning-rig.js';

describe('answering the grill', () => {
  it('records an option answer, clears the wait and queues the next turn', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    const out = await rig.engine.answerGrill(
      id,
      { question_id: 'q1', option_id: 'o2' },
      'owner',
    );

    expect(out.status).toBe('answered');
    expect((await eventsOf(rig, id, 'grill_answer'))[0]?.payload).toEqual({
      question_id: 'q1',
      option_id: 'o2',
      by: 'owner',
    });

    expect((await cardOf(rig, id)).needs_you).toBe(false);
    expect(
      await rig.storage.transaction((tx) => tx.cardReplyQueue.listOpen(id)),
    ).toHaveLength(1);
  });

  it('takes free text as the answer', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    expect((await answerWith(rig, id, 'other')).status).toBe('answered');
    expect((await eventsOf(rig, id, 'grill_answer'))[0]?.payload.text).toBe(
      'something else',
    );
  });

  it.each([
    [
      'both an option and text',
      { question_id: 'q1', option_id: 'o1', text: 'x' },
      'invalid_answer',
    ],
    ['neither an option nor text', { question_id: 'q1' }, 'invalid_answer'],
    [
      'an option the question does not have',
      { question_id: 'q1', option_id: 'o9' },
      'invalid_answer',
    ],
    [
      'a question that is not the open one',
      { question_id: 'q7', option_id: 'o1' },
      'question_not_open',
    ],
  ])('refuses %s', async (_name, input, status) => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    expect((await rig.engine.answerGrill(id, input, 'owner')).status).toBe(status);
    expect(await eventsOf(rig, id, 'grill_answer')).toEqual([]);
  });

  it('refuses an answer when nothing is open and for an unknown card', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();
    await answerWith(rig, id);

    expect((await answerWith(rig, id)).status).toBe('question_not_open');
    expect(
      (await rig.engine.answerGrill('FG-C42', { question_id: 'q1', text: 'x' }, 'o'))
        .status,
    ).toBe('not_found');
  });

  it('treats a chat message on a card with an open question as the free-text answer', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    await rig.engine.postCardMessage(id, 'Use SQLite please', 'owner');
    await rig.tick();

    expect((await eventsOf(rig, id, 'grill_answer'))[0]?.payload).toMatchObject({
      question_id: 'q1',
      text: 'Use SQLite please',
      by: 'owner',
    });

    expect(rig.llm.callsTo('card_chat')).toEqual([]);
  });
});

describe('grill shortcuts', () => {
  it('drops a question the model asked while the owner was already saying enough', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    rig.llm.during('grill_turn', async () => {
      await rig.engine.grillShortcut(id, 'write_plan_now', 'owner');
    });

    await rig.tick();

    expect(await eventsOf(rig, id, 'grill_question')).toEqual([]);
    expect((await eventsOf(rig, id, 'grill_done')).map((e) => e.payload.reason)).toEqual([
      'owner_enough',
    ]);

    expect((await cardOf(rig, id)).phase).toBe('in_progress');
  });

  it('use_recommendations answers the open question with its recommendation and ends the grill', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    const out = await rig.engine.grillShortcut(id, 'use_recommendations', 'owner');
    expect(out.status).toBe('applied');
    await rig.tick();

    expect((await eventsOf(rig, id, 'grill_answer'))[0]?.payload).toMatchObject({
      question_id: 'q1',
      option_id: 'o1',
      by: 'recommendation',
    });

    const done = (await eventsOf(rig, id, 'grill_done'))[0]?.payload;
    expect(done?.reason).toBe('use_recommendations');
    expect(rig.llm.callsTo('grill_turn')).toHaveLength(1);
    expect((await cardOf(rig, id)).phase).toBe('in_progress');
  });

  it('write_plan_now leaves the open question as an assumption and ends the grill', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    await rig.engine.grillShortcut(id, 'write_plan_now', 'owner');
    await rig.tick();

    const done = (await eventsOf(rig, id, 'grill_done'))[0]?.payload;
    expect(done?.reason).toBe('owner_enough');
    expect(done?.assumptions.join(' ')).toContain('Where are todos stored?');
    expect((await planOf(rig, id))?.assumptions.join(' ')).toContain(
      'Where are todos stored?',
    );
  });

  it('refuses a shortcut outside the planning phases', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    expect((await rig.engine.grillShortcut(id, 'write_plan_now', 'o')).status).toBe(
      'phase_mismatch',
    );

    expect((await rig.engine.grillShortcut('FG-C42', 'write_plan_now', 'o')).status).toBe(
      'not_found',
    );
  });
});

describe('start planning, conversion and nudges', () => {
  it('starts planning when a Discussion is converted to a planned type', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig, { type: 'discussion', dedupe_key: 'disc' });
    await rig.tick();
    expect(rig.llm.callsTo('card_survey')).toEqual([]);

    await rig.storage.transaction((tx) =>
      tx.cards.update(id, {
        type: 'plan',
        updated_at: new Date(rig.clock.now()).toISOString(),
      }),
    );

    await rig.tick();

    expect(await kinds(rig, id)).toContain('grill_question');
  });

  it('starts planning for a backfilled card that waits with "Start planning"', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    // The state migration 0021 leaves old open cards in: plan_ready, waiting, no flow, no plan.
    const at = new Date(rig.clock.now()).toISOString();
    await rig.storage.transaction(async (tx) => {
      for (const row of await tx.cardReplyQueue.listOpen(id)) {
        await tx.cardReplyQueue.complete(row.id, at);
      }

      await tx.cards.updatePhase(id, 0, {
        phase: 'plan_ready',
        needs_you: true,
        updated_at: at,
      });
    });

    const out = await rig.engine.startPlanning(id, 'owner');
    expect(out.status).toBe('started');
    expect((await cardOf(rig, id)).phase).toBe('grilling');

    await rig.tick();

    expect(await kinds(rig, id)).toContain('grill_question');
  });

  it('refuses Start planning for a card already planning, unknown, or a Discussion', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);

    expect((await rig.engine.startPlanning(id, 'o')).status).toBe('phase_mismatch');
    expect((await rig.engine.startPlanning('FG-C42', 'o')).status).toBe('not_found');
  });

  it('nudges an unanswered question once a day and never answers it', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();

    rig.clock.advance(25 * 60 * 60 * 1000);
    await rig.tick();
    await rig.tick();

    const nudges = (await eventsOf(rig, id, 'note')).filter((e) =>
      /waiting for your answer/i.test(e.payload.text),
    );

    expect(nudges).toHaveLength(1);
    expect(await eventsOf(rig, id, 'grill_answer')).toEqual([]);

    rig.clock.advance(25 * 60 * 60 * 1000);
    await rig.tick();

    expect(
      (await eventsOf(rig, id, 'note')).filter((e) =>
        /waiting for your answer/i.test(e.payload.text),
      ),
    ).toHaveLength(2);
  });
});

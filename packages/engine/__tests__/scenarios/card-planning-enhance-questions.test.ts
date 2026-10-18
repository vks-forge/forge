/**
 * Scenario: the enhance pass leaves questions only the owner can settle, and the card asks them.
 *
 * Why: the grill finishes before verify and enhance run, so by the time enhance queues the
 *   points only the owner can decide, the grill already says "done". Those questions must still
 *   be asked one at a time (the card waits in Needs you) before the plan is written, otherwise
 *   the card sits in Shaping with questions nobody sees and every chat message from the owner is
 *   swallowed with no reply (DCP-C3). The owner must always get an answer or a visible note
 *   (d-0135), and a card already stuck that way must recover on its own, with no hand edit of
 *   the database.
 *
 * Pins: enhance questions are asked after a finished grill, one by one, then the plan is
 *   written; a card stuck with queued questions and no open one asks the next one on a chat
 *   message and on a plain tick; a planning turn on an owner message never ends without a
 *   Director event after that message.
 * Depends on: helpers/planning-rig, helpers/rig, tick/planning-state, vitest.
 */

import { describe, expect, it } from 'vitest';
import type { CardId } from '@forge/core';
import {
  answerWith,
  cardOf,
  createPlanCard,
  events,
  eventsOf,
  makeDraftQuestion,
  planOf,
  planningRig,
  scriptTodo,
} from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { setNeedsYou } from '#/tick/planning-state.js';

const SERVE = makeDraftQuestion('What should the server expose at /core/?', [
  'Only src',
  'The whole folder',
]);

const LOCKFILE = makeDraftQuestion('Commit the lockfile?', ['Yes', 'No']);

/** A rig whose enhance pass leaves two owner questions. */
async function enhanceQuestionsRig(): Promise<Rig> {
  const rig = await planningRig();
  scriptTodo(rig, {
    enhance: [
      {
        summary: 'Two points need the owner.',
        report: '# Enhance\n\nTwo open points.',
        assumptions: ['Keep createServer(root) compatible.'],
        owner_questions: [SERVE, LOCKFILE],
      },
    ],
  });

  return rig;
}

/** Plans a card through the grill and enhance; enhance leaves two owner questions. */
async function throughEnhance(rig: Rig): Promise<CardId> {
  const id = await createPlanCard(rig);
  await rig.tick();
  await answerWith(rig, id);
  await rig.tick();

  return id;
}

/**
 * Puts the card in the state DCP-C3 was found in: grill done, enhance questions queued, none
 * open, nobody waited on. Stored state only, the way an older build left it.
 */
async function strandQuestions(rig: Rig, id: CardId): Promise<void> {
  await rig.storage.transaction(async (tx) => {
    const { grill } = await tx.cardPlanning.get(id);
    await tx.cardPlanning.update(id, {
      grill: { ...grill, current: null, queued: [SERVE, LOCKFILE], asked: 1 },
    });

    await setNeedsYou(tx, id, false, new Date(rig.clock.now()).toISOString());
  });
}

/** The seq of the newest owner chat message on the card. */
async function lastUserSeq(rig: Rig, id: CardId): Promise<number> {
  const msg = (await eventsOf(rig, id, 'user_message')).at(-1);
  if (!msg) {
    throw new Error('no user message');
  }

  return msg.seq;
}

/** Director-written events after `seq`. */
const directorAfter = async (rig: Rig, id: CardId, seq: number) =>
  (await events(rig, id)).filter((e) => e.seq > seq && e.actor.type === 'director');

describe('owner questions from the enhance pass', () => {
  it('asks them one at a time after the grill finished, then writes the plan', async () => {
    const rig = await enhanceQuestionsRig();
    const id = await throughEnhance(rig);

    let card = await cardOf(rig, id);
    expect(card.phase).toBe('verifying');
    expect(card.needs_you).toBe(true);
    expect(
      (await eventsOf(rig, id, 'grill_question')).map((e) => e.payload.text),
    ).toEqual(['Where are todos stored?', SERVE.text]);

    expect(rig.llm.callsTo('write_plan')).toEqual([]);

    await answerWith(rig, id);
    await rig.tick();

    expect((await eventsOf(rig, id, 'grill_question')).at(-1)?.payload.text).toBe(
      LOCKFILE.text,
    );

    expect(rig.llm.callsTo('write_plan')).toEqual([]);

    await answerWith(rig, id);
    await rig.tick();

    card = await cardOf(rig, id);
    expect(rig.llm.callsTo('write_plan')).toHaveLength(1);
    expect((await planOf(rig, id))?.version).toBe(1);
    const { grill } = await rig.storage.transaction((tx) => tx.cardPlanning.get(id));
    expect(grill.queued).toEqual([]);
    expect(grill.answers.map((a) => a.question)).toEqual([
      'Where are todos stored?',
      SERVE.text,
      LOCKFILE.text,
    ]);
  });
});

describe('a card stranded with queued questions (DCP-C3)', () => {
  it('asks the next question when the owner writes', async () => {
    const rig = await enhanceQuestionsRig();
    const id = await throughEnhance(rig);
    await strandQuestions(rig, id);

    await rig.engine.postCardMessage(id, 'tell me the points', 'owner');
    await rig.tick();

    const seq = await lastUserSeq(rig, id);
    const after = await directorAfter(rig, id, seq);
    expect(after.map((e) => e.kind)).toContain('grill_question');
    expect((await eventsOf(rig, id, 'grill_question')).at(-1)?.payload.text).toBe(
      SERVE.text,
    );

    expect((await cardOf(rig, id)).needs_you).toBe(true);
  });

  it('recovers on a plain tick with no message', async () => {
    const rig = await enhanceQuestionsRig();
    const id = await throughEnhance(rig);
    await strandQuestions(rig, id);
    const before = (await eventsOf(rig, id, 'grill_question')).length;

    await rig.tick();

    const asked = await eventsOf(rig, id, 'grill_question');
    expect(asked).toHaveLength(before + 1);
    expect(asked.at(-1)?.payload.text).toBe(SERVE.text);
    expect((await cardOf(rig, id)).needs_you).toBe(true);
  });
});

describe('a planning turn on an owner message', () => {
  it('never ends without a Director event after the message', async () => {
    const rig = await enhanceQuestionsRig();
    const id = await throughEnhance(rig);
    // A flow that has nothing left to run while the card is still being shaped.
    await rig.storage.transaction(async (tx) => {
      const { grill } = await tx.cardPlanning.get(id);
      await tx.cardPlanning.update(id, {
        flow_cursor: null,
        grill: { ...grill, current: null, queued: [] },
      });
    });

    const phase = (await cardOf(rig, id)).phase;
    if (phase !== 'grilling' && phase !== 'verifying') {
      throw new Error(`card left shaping (${phase}); the arrangement is wrong`);
    }

    await rig.engine.postCardMessage(id, 'what now?', 'owner');
    await rig.tick();

    const seq = await lastUserSeq(rig, id);
    const after = await directorAfter(rig, id, seq);
    expect(after.map((e) => e.kind)).toContain('director_message');
  });
});

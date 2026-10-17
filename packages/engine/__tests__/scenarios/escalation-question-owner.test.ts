/**
 * Scenario: the Director hands a Worker's question to the owner.
 *
 * Why: the Director answers alone only when every safeguard holds (confident enough, cited
 *   grounds, not Tier C, not "approve everything"); in every other case, and on any error, the
 *   owner gets the question with the Director's suggestion and options, answers it through `act`
 *   exactly once, and a second click is refused. Fail closed means ask the human (d-0141 item 8).
 *
 * Pins: Done-when 2 (0.5 confidence or Tier C: owner-stage question with suggestion and options,
 *   answered through `act`, a second act is `not_pending`), Done-when 9 (parse failure or a model
 *   error escalates at once), the grounds rule, always_ask, the owner's threshold, director_first
 *   off, the report_blocked source, the stage hiding the question from the owner while the
 *   Director looks, and every action refused on a question still with the Director.
 * Depends on: helpers/rig, helpers/escalation-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  ask,
  cardEventsOf,
  interactionsOf,
  overrideDirector,
  setTier,
} from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';
import { fail } from '#tests/helpers/scripted-llm.js';

const SURE = {
  decision: 'answer',
  answer: 'Use blue, as d-0012 decided.',
  confidence: 0.9,
  grounds: [{ kind: 'decision', ref: 'd-0012' }],
};

const UNSURE = {
  decision: 'escalate',
  confidence: 0.5,
  grounds: [],
  escalate_reason: 'owner_preference',
  suggested_answer: 'Blue',
  options: [
    { id: 'blue', label: 'Blue', recommended: true },
    { id: 'red', label: 'Red', recommended: false },
  ],
};

async function onlyInteraction(rig: Rig, id: string) {
  const all = await interactionsOf(rig, id);
  expect(all).toHaveLength(1);

  return all[0]!;
}

describe('the Director hands the question to the owner', () => {
  it('escalates at 0.5 with the suggestion and options, and the owner answers through act', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', UNSURE);
    const id = await ask(rig);

    const row = await onlyInteraction(rig, id);
    expect(row.status).toBe('pending');
    expect(row.escalated_at).toBeDefined();
    expect(row.card_id).toBe((await rig.ticket(id)).card_id);
    expect(row.payload).toMatchObject({
      kind: 'question',
      text: 'Which colour?',
      source: 'ask_director',
      suggested_answer: 'Blue',
      options: [
        { id: 'blue', label: 'Blue', recommended: true },
        { id: 'red', label: 'Red', recommended: false },
      ],
    });

    const opened = await cardEventsOf(rig, row.card_id, 'escalation');
    expect(opened).toHaveLength(1);
    expect(opened[0]!.payload).toMatchObject({
      interaction_id: 'int-q1',
      escalation_kind: 'question',
    });

    const done = await rig.engine.actOnEscalation(
      'int-q1',
      { action: 'answer', option_id: 'red' },
      'owner',
    );

    expect(done.status).toBe('done');
    const answered = await onlyInteraction(rig, id);
    expect(answered.answer).toMatchObject({
      action: 'answer',
      by: 'owner',
      option_id: 'red',
      text: 'Red',
    });

    const report = await rig.tick();
    expect(report.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'resume' }]);
    expect(JSON.stringify(rig.llm.callsTo('dispatch_prompt')[1]!.input)).toContain('Red');

    const again = await rig.engine.actOnEscalation(
      'int-q1',
      { action: 'answer', text: 'Green' },
      'owner',
    );

    expect(again).toMatchObject({ status: 'not_pending' });
    const settled = await cardEventsOf(rig, row.card_id, 'escalation_settled');
    expect(settled.map((e) => e.payload.by)).toEqual(['owner']);
  });

  it('accepts a free-text answer and refuses an option the question does not have', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', UNSURE);
    await ask(rig);

    expect(
      await rig.engine.actOnEscalation(
        'int-q1',
        { action: 'answer', option_id: 'purple' },
        'owner',
      ),
    ).toMatchObject({ status: 'invalid_answer' });

    expect(
      await rig.engine.actOnEscalation(
        'int-q1',
        { action: 'answer', text: 'Teal, please' },
        'owner',
      ),
    ).toMatchObject({ status: 'done' });
  });

  it('never answers alone on a Tier C ticket, whatever the model says', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', { ...SURE, confidence: 0.99 });
    const id = await rig.request('Change the policy');
    await rig.tick();
    await setTier(rig, id, 'C');
    rig.driver.emit('run-1', {
      type: 'ask',
      interaction_id: 'int-q1',
      kind: 'question',
      prompt: 'Which colour?',
    });

    await rig.storage.transaction((tx) =>
      tx.interactions.insert({
        id: 'int-q1',
        ticket_id: id,
        run_id: 'run-1',
        kind: 'question',
        payload: { prompt: 'Which colour?' },
        status: 'pending',
        asked_at: new Date(rig.clock.now()).toISOString(),
        timeout_at: new Date(rig.clock.now() + 3_600_000).toISOString(),
      }),
    );

    rig.driver.finish(
      'run-1',
      makeResult({
        status: 'paused',
        pauseReason: 'interaction',
        interactionId: 'int-q1',
        session: 'sess-A',
      }),
    );

    await rig.flush();
    await rig.tick();

    const row = await onlyInteraction(rig, id);
    expect(row.status).toBe('pending');
    expect(row.escalated_at).toBeDefined();
    expect(row.payload).toMatchObject({
      kind: 'question',
      suggested_answer: SURE.answer,
    });
  });

  it('needs grounds, even at high confidence', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', { ...SURE, grounds: [], confidence: 0.99 });
    const id = await ask(rig);

    expect((await onlyInteraction(rig, id)).status).toBe('pending');
  });

  it('never answers alone when the owner chose always_ask', async () => {
    const rig = await makeRig();
    await overrideDirector(rig, { approval_mode: 'always_ask' });
    rig.llm.script('ticket_answer', SURE);
    const id = await ask(rig);

    expect((await onlyInteraction(rig, id)).status).toBe('pending');
  });

  it('uses the owner threshold from settings', async () => {
    const rig = await makeRig();
    await overrideDirector(rig, { escalation: { answer_confidence: 0.95 } });
    rig.llm.script('ticket_answer', SURE);
    const id = await ask(rig);

    expect((await onlyInteraction(rig, id)).status).toBe('pending');
  });

  it('turns the answer it would have given into the suggestion when it is below the threshold', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', { ...SURE, confidence: 0.6 });
    const id = await ask(rig);

    expect((await onlyInteraction(rig, id)).payload).toMatchObject({
      suggested_answer: SURE.answer,
    });
  });

  it('skips the Director when director_first is off and hands the question over at once', async () => {
    const rig = await makeRig();
    await overrideDirector(rig, { escalation: { director_first: false } });
    const id = await ask(rig);

    expect(rig.llm.callsTo('ticket_answer')).toEqual([]);
    const row = await onlyInteraction(rig, id);
    expect(row.escalated_at).toBeDefined();
    expect(row.payload).not.toHaveProperty('suggested_answer');
  });

  it('escalates at once, with no suggestion, when the answer does not parse', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', { nonsense: true });
    const id = await ask(rig);

    const row = await onlyInteraction(rig, id);
    expect(row.status).toBe('pending');
    expect(row.escalated_at).toBeDefined();
    expect(row.payload).not.toHaveProperty('suggested_answer');
    // The invalid answer was retried once with the validation error, then given up on.
    expect(rig.llm.callsTo('ticket_answer')).toHaveLength(2);
  });

  it('escalates at once when the model call fails', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', fail({ kind: 'stall', message: 'timed out' }));
    const id = await ask(rig);

    expect((await onlyInteraction(rig, id)).escalated_at).toBeDefined();
  });

  it('escalates when the model keeps asking for reads after the last round', async () => {
    const rig = await makeRig();
    await rig.seedProject({ local_path: '/repo/forge' });
    rig.llm.script('ticket_answer', {
      decision: 'escalate',
      confidence: 0,
      grounds: [],
      read_requests: [{ op: 'read', path: 'a.md' }],
    });

    const id = await ask(rig);

    expect((await onlyInteraction(rig, id)).escalated_at).toBeDefined();
    expect(rig.llm.callsTo('ticket_answer')).toHaveLength(3);
  });

  it('shows the owner a blocker (report_blocked) as a question with that source', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', UNSURE);
    const id = await ask(rig, 'The migration needs the prod key', 'blocked');

    expect((await onlyInteraction(rig, id)).payload).toMatchObject({
      kind: 'question',
      source: 'report_blocked',
      text: 'The migration needs the prod key',
    });
  });
});

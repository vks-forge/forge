/**
 * Scenario: a Worker asks a question and the Director takes the first look.
 *
 * Why: most Worker questions are already settled in the plan, a decision or the repo's own rules,
 *   and making the owner answer each one wastes their attention; but a Director that answers a
 *   real product choice, or any question on Tier C work, puts its guess into code. So a new
 *   question starts with the Director (hidden from the owner), which may answer alone only with
 *   cited grounds and enough confidence, never on Tier C or when the owner asked to approve
 *   everything, and otherwise hands the owner the question with its suggestion. Any Director
 *   error escalates at once: fail closed means ask the human (d-0141 item 8).
 *
 * Pins: Done-when 1 (answer from a decision at 0.9, the Worker resumes, no owner item, the card
 *   history says the Director answered), Done-when 2 (0.5 or Tier C: the owner gets the question
 *   with a suggestion and options, answers through `act`, a second act is `not_pending`),
 *   Done-when 9 (a parse failure or a model error escalates at once), the grounds rule,
 *   always_ask, director_first off, the read round through `admit()`, the typed payload the
 *   Worker's legacy row becomes, and the Director's spend counting on the card budget.
 * Depends on: helpers/rig, helpers/escalation-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  ask,
  cardEventsOf,
  interactionsOf,
  ownerPending,
  pendingOf,
} from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

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

describe('the Director answers alone', () => {
  it('answers from a decision at 0.9: the Worker resumes, the owner sees nothing, the card says so', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_answer', SURE);
    const id = await ask(rig);

    const row = await onlyInteraction(rig, id);
    expect(row.status).toBe('answered');
    expect(row.answer).toMatchObject({
      action: 'answer',
      by: 'director',
      text: 'Use blue, as d-0012 decided.',
    });

    expect(await ownerPending(rig)).toEqual([]);

    // The answer wakes the Worker in the same tick: the resumed run is already live.
    expect(rig.driver.starts[1]).toMatchObject({ runId: 'run-2', resume: 'sess-A' });
    expect((await rig.ticket(id)).assignee_run_id).toBe('run-2');
    expect(JSON.stringify(rig.llm.callsTo('dispatch_prompt')[1]!.input)).toContain(
      'Use blue, as d-0012 decided.',
    );

    const ticket = await rig.ticket(id);
    const settled = await cardEventsOf(rig, ticket.card_id, 'escalation_settled');
    expect(settled).toHaveLength(1);
    expect(settled[0]!.payload).toMatchObject({
      interaction_id: 'int-q1',
      ticket_id: id,
      action: 'answer',
      by: 'director',
    });

    expect(await cardEventsOf(rig, ticket.card_id, 'escalation')).toEqual([]);
  });

  it('gives the model the question, the ticket, the project rules and the repo rules', async () => {
    const rig = await makeRig();
    rig.repo.files = { 'CLAUDE.md': '# Rules\nPrefer blue.\n' };
    await rig.seedProject({ local_path: '/repo/forge' });
    rig.llm.script('ticket_answer', SURE);
    const id = await ask(rig, 'Which colour?');

    const input = rig.llm.callsTo('ticket_answer')[0]!.input as Record<string, unknown>;
    expect(input['question']).toMatchObject({ text: 'Which colour?' });
    expect(input['ticket']).toMatchObject({ id, title: expect.any(String) });
    expect(JSON.stringify(input['project_rules'])).toContain('Prefer blue.');
    expect(input['playbook']).toMatchObject({ id: 'answer-worker' });
    expect(input['escalation']).toMatchObject({ answer_confidence: 0.8 });
    expect(rig.llm.callsTo('ticket_answer')[0]!.opts.model).toBe('sonnet');
  });

  it('counts the step on the card budget as the Director spends', async () => {
    const rig = await makeRig();
    rig.llm.cost('ticket_answer', 0.25);
    rig.llm.script('ticket_answer', SURE);
    const id = await ask(rig);

    const card = (await rig.ticket(id)).card_id!;
    const planning = await rig.storage.transaction((tx) => tx.cardPlanning.get(card));
    expect(planning.grill.director_spend_usd).toBeCloseTo(0.25);
  });

  it('runs the read round through admit(): a repo file is read, a secret is refused', async () => {
    const rig = await makeRig();
    await rig.seedProject({ local_path: '/repo/forge' });
    rig.repo.files = { 'docs/plan.md': 'Colour is blue.', '.env': 'SECRET=1' };
    rig.llm.script(
      'ticket_answer',
      {
        decision: 'escalate',
        confidence: 0,
        grounds: [],
        read_requests: [
          { op: 'read', path: 'docs/plan.md' },
          { op: 'read', path: '.env' },
        ],
      },
      SURE,
    );

    const id = await ask(rig);

    const calls = rig.llm.callsTo('ticket_answer');
    expect(calls).toHaveLength(2);
    const results = (calls[1]!.input as Record<string, unknown>)['read_results'] as {
      ok: boolean;
      text?: string;
    }[];

    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(results[0]!.text).toContain('Colour is blue.');
    expect((await onlyInteraction(rig, id)).status).toBe('answered');
  });
});

describe('a question still with the Director', () => {
  it('keeps the question out of the owner stage while the Director looks', async () => {
    const rig = await makeRig();
    let during: unknown[] = [];
    rig.llm.during('ticket_answer', async () => {
      during = await ownerPending(rig);
    });

    rig.llm.script('ticket_answer', UNSURE);
    const id = await ask(rig);

    expect(during).toEqual([]);
    expect(await pendingOf(rig, id)).toHaveLength(1);
  });

  it('refuses every action on a question the Director is still looking at', async () => {
    const rig = await makeRig();
    let during: unknown;
    rig.llm.during('ticket_answer', async () => {
      during = await rig.engine.actOnEscalation('int-q1', { action: 'cancel' }, 'owner');
    });

    rig.llm.script('ticket_answer', UNSURE);
    await ask(rig);

    expect(during).toMatchObject({ status: 'action_not_offered' });
    expect(
      await rig.engine.actOnEscalation('nope', { action: 'cancel' }, 'owner'),
    ).toEqual({ status: 'not_found' });
  });
});

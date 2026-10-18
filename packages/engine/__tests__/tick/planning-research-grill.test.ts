/**
 * Scenario: the grill looks an outside fact up before it asks the owner.
 *
 * Why: the next grill question sometimes rests on a fact a document can answer (d-0144). The grill model may answer a turn with research questions; the engine runs one research run and takes the same turn again with the checked evidence. At most one detour happens per turn, a card has a limit of research runs, and detours can be switched off; past a limit the turn goes on with a plain note, never a stop.
 *
 * Pins: one detour then the grill again with evidence, a second detour in one turn refused as a rejected step, the per-card run limit with a note, detours switched off.
 * Depends on: helpers/planning-rig, helpers/research-scenario, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  answerWith,
  cardOf,
  createPlanCard,
  eventsOf,
  makeDraftQuestion,
  pick,
  scriptTodo,
} from '#tests/helpers/planning-rig.js';
import {
  standardRun,
  rigWith,
  evidenceOf,
  setResearchCaps,
} from '#tests/helpers/research-scenario.js';

describe('research during the grill', () => {
  const detour = (q = 'What is the Widget API rate limit?') => ({
    done: false,
    research: { questions: [q] },
    open_points: 1,
    assumptions: [],
  });

  const question = {
    done: false,
    question: makeDraftQuestion('Cache the Widget API calls?'),
    open_points: 1,
    assumptions: [],
  };

  it('runs one research run, then asks the grill again with the new evidence before the owner is asked', async () => {
    const rig = await rigWith();
    scriptTodo(rig, {
      grill_turn: [detour(), question],
    });

    rig.llm.script('research', ...standardRun());

    const id = await createPlanCard(rig);
    await rig.tick();

    expect(rig.llm.callsTo('research').length).toBe(3);
    const turns = rig.llm.callsTo('grill_turn');
    expect(turns).toHaveLength(2);
    expect(pick(turns[0]?.input, 'evidence')).toEqual([]);
    expect(JSON.stringify(turns[1]?.input)).not.toContain(
      'The Widget API has a rate limit',
    );

    const after = pick(turns[1]?.input, 'evidence') as { ref: string; status: string }[];
    expect(after.map((e) => [e.ref, e.status])).toEqual([
      ['E1', 'verified'],
      ['E2', 'unverified'],
    ]);

    expect((await evidenceOf(rig, id))[0]).toMatchObject({
      origin: 'grill_detour',
      step_id: 'grill',
    });

    const asked = await eventsOf(rig, id, 'grill_question');
    expect(asked).toHaveLength(1);
    expect(asked[0]?.payload.text).toBe('Cache the Widget API calls?');
    expect((await eventsOf(rig, id, 'research'))[0]?.payload.origin).toBe('grill_detour');
  });

  it('refuses a second detour in the same turn and runs no second research', async () => {
    const rig = await rigWith();
    scriptTodo(rig, {
      grill_turn: [detour(), detour('And what about its burst limit?')],
    });

    rig.llm.script('research', ...standardRun());

    const id = await createPlanCard(rig);
    const report = await rig.tick();

    expect(rig.llm.callsTo('research')).toHaveLength(3);
    expect(report.rejectedSteps.map((r) => r.step)).toContain('grill_turn');
    expect(await eventsOf(rig, id, 'grill_question')).toEqual([]);
  });

  it('makes a note and runs no research past the per-card run limit, then goes on', async () => {
    const rig = await rigWith();
    await setResearchCaps(rig, { max_runs_per_card: 1 });
    scriptTodo(rig, {
      grill_turn: [
        detour(),
        question,
        detour('How about the burst limit of the Widget API?'),
        {
          done: true,
          done_reason: 'nothing_open',
          open_points: 0,
          assumptions: [],
        },
      ],
    });

    rig.llm.script('research', ...standardRun());

    const id = await createPlanCard(rig);
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    expect(rig.llm.callsTo('research')).toHaveLength(3);
    const notes = (await eventsOf(rig, id, 'director_message')).map(
      (e) => e.payload.text,
    );

    expect(notes.join(' ')).toMatch(/research limit/i);
    expect(rig.llm.callsTo('grill_turn').length).toBe(4);
    expect((await cardOf(rig, id)).phase).not.toBe('grilling');
  });

  it('proceeds without research when detours are switched off', async () => {
    const rig = await rigWith();
    await setResearchCaps(rig, { grill_detours: false });
    scriptTodo(rig, { grill_turn: [detour(), question] });

    const id = await createPlanCard(rig);
    await rig.tick();

    expect(rig.llm.callsTo('research')).toEqual([]);
    expect(await eventsOf(rig, id, 'grill_question')).toHaveLength(1);
  });
});

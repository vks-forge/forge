/**
 * Scenario: every Director step that read the whole memory now reads it through the memory index.
 *
 * Why: six steps (triage, planning, card chat, dispatch, the two escalation steps) each pasted a project's
 *   whole memory into the prompt. With a memory index on a project of 150 decisions each of them must show
 *   the pinned and relevant decisions with a "Showing N of 150" note and every rejected approach, must not
 *   read the old whole slice, and a plan that repeats a rejected approach the search would not have shown
 *   must still be flagged for the owner. Without an index nothing changes.
 *
 * Pins: the six step inputs carry the note and the full rejected list, the old source is not read, the card
 *   chat and planning calls make one rewrite call and the ticket steps make none, a plan matching a
 *   rejected approach top-k would miss reaches the owner with the id in `rejected_hits`, and a rig with no
 *   index still reads the old slice.
 * Depends on: helpers/rig, helpers/planning-rig, helpers/escalation-rig, helpers/card-chat,
 *   helpers/fake-memory-index, helpers/memory-ctx, vitest.
 */

import { describe, expect, it } from 'vitest';
import { C1, discussion, say } from '#tests/helpers/card-chat.js';
import { ask, crashTo } from '#tests/helpers/escalation-rig.js';
import { createFakeMemoryIndex } from '#tests/helpers/fake-memory-index.js';
import { manyRecords } from '#tests/helpers/memory-ctx.js';
import {
  cardOf,
  createPlanCard,
  eventsOf,
  planOf,
  planningRig,
  todoPlan,
} from '#tests/helpers/planning-rig.js';
import { makeRig } from '#tests/helpers/rig.js';

const NOTE =
  /^Showing \d+ of 150 active decisions: pinned and most relevant; all rejected approaches are listed$/;

const records = () => manyRecords(150, 4, 2);

describe('triage, dispatch and the escalation steps', () => {
  it('show a note and every rejected approach, and never call the rewrite step', async () => {
    const rig = await makeRig({ memoryIndex: createFakeMemoryIndex(records()) });
    rig.llm.script('ticket_recover', {
      decision: 'escalate',
      diagnosis: 'Needs a person.',
      confidence: 0.1,
    });

    const id = await rig.request('Add a flag for topic12');
    await rig.tick();

    const triage = rig.llm.callsTo('triage')[0]?.input['memory'] as {
      decisions: { id: string }[];
      rejected: unknown[];
      note: string;
    };

    expect(triage.note).toMatch(NOTE);
    expect(triage.decisions.map((d) => d.id)).toEqual(
      expect.arrayContaining(['d-0001', 'd-0012']),
    );

    expect(triage.rejected).toHaveLength(4);
    const dispatch = rig.llm.callsTo('dispatch_prompt')[0]?.input['memory'] as {
      note: string;
    };

    expect(dispatch.note).toMatch(NOTE);

    await crashTo(rig, id, 2);
    const recover = rig.llm.callsTo('ticket_recover')[0]?.input['project_rules'] as {
      note: string;
      rejected: unknown[];
    };

    expect(recover.note).toMatch(NOTE);
    expect(recover.rejected).toHaveLength(4);
    expect(rig.memory.calls).toEqual([]);
    expect(rig.llm.callsTo('memory_rewrite')).toEqual([]);
  });

  it('shows the Worker question step the same memory', async () => {
    const rig = await makeRig({ memoryIndex: createFakeMemoryIndex(records()) });

    await ask(rig);

    const rules = rig.llm.callsTo('ticket_answer')[0]?.input['project_rules'] as {
      note: string;
      rejected: unknown[];
    };

    expect(rules.note).toMatch(NOTE);
    expect(rules.rejected).toHaveLength(4);
    expect(rig.llm.callsTo('memory_rewrite')).toEqual([]);
  });
});

describe('card chat and planning', () => {
  it('give the chat step the note and ask the rewrite step once', async () => {
    const rig = await makeRig({ memoryIndex: createFakeMemoryIndex(records()) });
    await discussion(rig);
    await say(rig, 'what about topic5?', C1);
    await rig.tick();

    const memory = rig.llm.callsTo('card_chat')[0]?.input['memory'] as {
      note: string;
      rejected: unknown[];
    };

    expect(memory.note).toMatch(NOTE);
    expect(memory.rejected).toHaveLength(4);
    expect(rig.llm.callsTo('memory_rewrite')).toHaveLength(1);
    expect(rig.memory.calls).toEqual([]);
  });

  it('give a planning step the note under project_rules and ask the rewrite step once per question', async () => {
    const rig = await planningRig({ memoryIndex: createFakeMemoryIndex(records()) });
    await createPlanCard(rig);
    await rig.tick();

    const first = rig.llm.calls.find((c) => c.name === 'card_survey');
    const rules = first?.input['project_rules'] as { note: string; rejected: unknown[] };

    expect(rules.note).toMatch(NOTE);
    expect(rules.rejected).toHaveLength(4);
    expect(rig.llm.callsTo('memory_rewrite').length).toBeGreaterThanOrEqual(1);
    expect(rig.llm.callsTo('memory_rewrite').length).toBeLessThanOrEqual(2);
  });

  it('flags a plan that repeats a rejected approach the search did not show, even when verify names none', async () => {
    const index = createFakeMemoryIndex([
      ...manyRecords(150, 0, 0),
      {
        id: 'r-0042',
        kind: 'rejected',
        statement: 'Adopt the Mem0 vector memory framework as the storage backend.',
      },
    ]);

    const rig = await planningRig({ memoryIndex: index });
    rig.llm.script(
      'write_plan',
      todoPlan({
        goal: 'Adopt the vector memory framework Mem0 as the storage backend for todos.',
      }),
    );

    const id = await createPlanCard(rig);
    await rig.tick();
    const { answerWith } = await import('#tests/helpers/planning-rig.js');
    await answerWith(rig, id);
    await rig.tick();

    const plan = await planOf(rig, id);
    expect(plan?.verification.rejected_hits).toEqual(['r-0042']);
    expect((await cardOf(rig, id)).needs_you).toBe(true);
    const ask = (await eventsOf(rig, id, 'needs_you')).at(-1)?.payload;
    expect(ask?.reason).toContain('matches an approach that was rejected before: r-0042');
  });

  it('adds nothing for a plan that does not repeat a rejected approach', async () => {
    const index = createFakeMemoryIndex([
      {
        id: 'r-0042',
        kind: 'rejected',
        statement: 'Adopt the Mem0 vector memory framework.',
      },
    ]);

    const rig = await planningRig({ memoryIndex: index });
    const id = await createPlanCard(rig);
    await rig.tick();
    const { answerWith } = await import('#tests/helpers/planning-rig.js');
    await answerWith(rig, id);
    await rig.tick();

    expect((await planOf(rig, id))?.verification.rejected_hits).toEqual([]);
  });
});

describe('without an index', () => {
  it('still reads the old whole slice and adds no note', async () => {
    const rig = await makeRig();
    await rig.request('Add a flag');
    await rig.tick();

    const memory = rig.llm.callsTo('triage')[0]?.input['memory'] as Record<
      string,
      unknown
    >;

    expect(rig.memory.calls).toContain('forge');
    expect(memory['note']).toBeUndefined();
    expect(Object.keys(memory).sort()).toEqual(['decisions', 'rejected']);
  });
});

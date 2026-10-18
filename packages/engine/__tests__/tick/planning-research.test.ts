/**
 * Scenario: the Director researches outside facts while it plans a card.
 *
 * Why: a plan or a grill question sometimes rests on a fact the repository cannot answer (a library's rate limit). The research step reads pages written by strangers, so the engine, not the model, makes the result trustworthy (d-0144, d-0001): it stores each page as a numbered source and marks a claim verified only when one of its quotes is really on the stored page. What the plan rests on is then marked by the engine. A failed run leaves nothing behind and its rerun never writes a second `S1`, and research spend counts toward the card budget, which warns and never blocks (d-0143).
 *
 * Pins: stored sources and verified or unverified evidence, the `research` card event, spend, evidence in the write_plan input and the plan; skipping by `step_decisions`; the outside claims earlier steps flagged; a rerun after a failure; the budget warning for research spend and for a new cap.
 * Depends on: helpers/planning-rig, helpers/research-scenario, helpers/rig, vitest.
 */

import type { CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  answerWith,
  createPlanCard,
  eventsOf,
  pick,
  planOf,
  scriptTodo,
  todoPlan,
} from '#tests/helpers/planning-rig.js';
import {
  CLAIM,
  GOOD_QUOTE,
  search,
  fetchOf,
  findings,
  goodClaim,
  standardRun,
  rigWith,
  planThrough,
  sourcesOf,
  evidenceOf,
  spendOf,
} from '#tests/helpers/research-scenario.js';
import type { Rig } from '#tests/helpers/rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';
import { warnOnBudget } from '#/tick/card-budget.js';

describe('the research step', () => {
  it('stores the page as S1, verifies the real quote, rejects the invented one and tells the plan', async () => {
    const rig = await rigWith();
    rig.llm.script('research', ...standardRun());
    rig.llm.script(
      'write_plan',
      todoPlan({ outside_claims: [{ claim: CLAIM, evidence: ['E1'] }] }),
    );

    const id = await planThrough(rig);

    const sources = await sourcesOf(rig, id);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      ref: 'S1',
      origin: 'director',
      url: 'https://docs.example.com/widget',
      title: 'Widget API',
    });

    const stored = await rig.storage.transaction((tx) =>
      tx.researchSources.getByRef(id, 'S1'),
    );

    expect(stored?.text).toContain('rate limit of 100 requests per minute');

    const evidence = await evidenceOf(rig, id);
    expect(evidence.map((e) => [e.ref, e.status])).toEqual([
      ['E1', 'verified'],
      ['E2', 'unverified'],
    ]);

    expect(evidence[0]).toMatchObject({
      origin: 'research_step',
      step_id: 'research',
      question: 'What is the limit?',
      sources: ['S1'],
      quotes: [{ source: 'S1', quote: GOOD_QUOTE }],
    });

    expect(evidence[1]?.quotes).toEqual([]);

    const event = (await eventsOf(rig, id, 'research'))[0]?.payload;
    expect(event).toMatchObject({
      step_id: 'research',
      origin: 'research_step',
      searches: ['widget api rate limit'],
      fetched: [{ ref: 'S1', url: 'https://docs.example.com/widget' }],
      claims: [
        { ref: 'E1', status: 'verified' },
        { ref: 'E2', status: 'unverified' },
      ],
      unanswered: [],
    });
  });

  it('counts the research calls and the provider price in the card spend', async () => {
    const rig = await rigWith();
    rig.research!.searchCostUsd = 0.02;
    rig.llm.cost('research', 0.1);
    rig.llm.script('research', ...standardRun());

    const id = await planThrough(rig);

    expect(await spendOf(rig, id)).toBeCloseTo(0.32, 5);
    expect((await eventsOf(rig, id, 'research'))[0]?.payload.cost_usd).toBeCloseTo(
      0.32,
      5,
    );
  });

  it('gives write_plan the checked evidence and has the engine fill the plan', async () => {
    const rig = await rigWith();
    rig.llm.script('research', ...standardRun());
    rig.llm.script(
      'write_plan',
      todoPlan({
        outside_claims: [
          { claim: CLAIM, evidence: ['E1'] },
          { claim: 'It is free forever.', evidence: ['E2'] },
          { claim: 'It scales to a million keys.', evidence: [] },
        ],
      }),
    );

    const id = await planThrough(rig);

    const input = rig.llm.callsTo('write_plan')[0]?.input;
    // Nothing raw goes downstream: the page text is not in the step input, only the verified quote is.
    expect(JSON.stringify(input)).not.toContain('The Widget API has a rate limit');
    expect(JSON.stringify(input)).toContain(GOOD_QUOTE);

    const seen = pick(input, 'evidence') as {
      ref: string;
      status: string;
      sources: { url: string }[];
    }[];

    expect(seen.map((e) => [e.ref, e.status])).toEqual([
      ['E1', 'verified'],
      ['E2', 'unverified'],
    ]);

    expect(seen[0]?.sources[0]?.url).toBe('https://docs.example.com/widget');

    const plan = await planOf(rig, id);
    expect(plan?.verification.evidence.map((e) => e.ref)).toEqual(['E1', 'E2']);
    expect(plan?.verification.evidence[0]?.source_list[0]).toMatchObject({
      ref: 'S1',
      url: 'https://docs.example.com/widget',
      title: 'Widget API',
    });

    expect(plan?.verification.outside_claims).toEqual([
      { claim: CLAIM, evidence: ['E1'], status: 'supported' },
      { claim: 'It is free forever.', evidence: ['E2'], status: 'unverified' },
      { claim: 'It scales to a million keys.', evidence: [], status: 'unverified' },
    ]);
  });

  it('is skipped, with no model call, when an earlier step says nothing rests on outside facts', async () => {
    const rig = await rigWith();
    scriptTodo(rig, {
      card_survey: [
        {
          findings: { summary: 'Self-contained.', predicted_lane: 'standard' },
          step_decisions: { research: false },
        },
      ],
    });

    const id = await planThrough(rig);

    expect(rig.llm.callsTo('research')).toEqual([]);
    expect(await eventsOf(rig, id, 'research')).toEqual([]);
    expect((await planOf(rig, id))?.version).toBe(1);
  });

  it('hands the research step the outside claims earlier steps flagged and no repository text', async () => {
    const rig = await rigWith();
    scriptTodo(rig, {
      verify: [
        {
          findings: {
            summary: 'Mostly fine.',
            blast_radius: 'small',
            risks: [
              'OUTSIDE CLAIM: the Widget API rate limit is 100 per minute',
              'plain risk',
            ],
          },
        },
      ],
    });

    await planThrough(rig);

    const input = rig.llm.callsTo('research')[0]?.input;
    expect(pick(input, 'claims_to_check')).toEqual([
      'OUTSIDE CLAIM: the Widget API rate limit is 100 per minute',
    ]);

    expect(JSON.stringify(input)).not.toContain('Use small functions');
    expect(pick(input, 'project_rules')).toBeUndefined();
  });
});

describe('a rerun after a failure', () => {
  it('starts from its first round and never writes a second S1', async () => {
    const rig = await rigWith();
    rig.llm.script(
      'research',
      { research_requests: [search()] },
      { research_requests: [fetchOf()] },
      fail({ kind: 'crash', message: 'process died' }),
      { research_requests: [search()] },
      { research_requests: [fetchOf()] },
      findings([goodClaim]),
    );

    const id = await createPlanCard(rig);
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    // Nothing was written by the failed run.
    expect(await sourcesOf(rig, id)).toEqual([]);
    expect(await evidenceOf(rig, id)).toEqual([]);

    rig.clock.advance(11 * 60 * 1000);
    await rig.tick();

    expect((await sourcesOf(rig, id)).map((s) => s.ref)).toEqual(['S1']);
    expect((await evidenceOf(rig, id)).map((e) => e.ref)).toEqual(['E1']);
    expect((await eventsOf(rig, id, 'research')).length).toBe(1);
  });
});

describe('research spend and the card budget (d-0143)', () => {
  const warnings = async (rig: Rig, id: CardId) =>
    (await eventsOf(rig, id, 'budget_warning')).map((e) => [
      e.payload.threshold,
      e.payload.cap_usd,
    ]);

  const capTo = (rig: Rig, id: CardId, cap: number | undefined) =>
    rig.storage.transaction((tx) =>
      tx.cards.update(id, {
        budget_cap_usd: cap,
        updated_at: '2026-10-18T12:00:00.000Z',
      }),
    );

  it('warns once at 80 percent from research spend, never blocks, and warns again for a new cap', async () => {
    const rig = await rigWith();
    rig.llm.cost('research', 0.3);
    rig.llm.script('research', ...standardRun());
    const id = await createPlanCard(rig);
    await capTo(rig, id, 1);
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    // 3 research calls at $0.30 is $0.90: past 80 percent of $1, short of the cap itself.
    expect(await warnings(rig, id)).toEqual([[0.8, 1]]);
    expect((await planOf(rig, id))?.version).toBe(1);

    await rig.storage.transaction((tx) =>
      warnOnBudget(tx, id, '2026-10-18T12:05:00.000Z'),
    );

    expect(await warnings(rig, id)).toEqual([[0.8, 1]]);

    await capTo(rig, id, 1.1);
    await rig.storage.transaction((tx) =>
      warnOnBudget(tx, id, '2026-10-18T12:10:00.000Z'),
    );

    expect(await warnings(rig, id)).toEqual([
      [0.8, 1],
      [0.8, 1.1],
    ]);
  });
});

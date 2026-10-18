/**
 * Scenario: the plan's outside claims reach the approval floor, and research that cannot run never stops the plan.
 *
 * Why: a plan resting on an unverified outside claim is for the owner to approve (d-0141 item 6, d-0144), the approval step sees claims but never quotes or page text, and a provider that is off or down is a plain note on the card, never a dead end (d-0135).
 *
 * Pins: an unverified claim sends the plan to the owner, supported claims leave it to the Director, the approval input carries no quote, provider none, a project that switched research off, a provider that does not answer.
 * Depends on: helpers/planning-rig, helpers/research-scenario, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { cardOf, eventsOf, pick, planOf, todoPlan } from '#tests/helpers/planning-rig.js';
import {
  CLAIM,
  GOOD_QUOTE,
  search,
  findings,
  standardRun,
  rigWith,
  planThrough,
} from '#tests/helpers/research-scenario.js';

describe('approval floor and outside claims', () => {
  it('sends a plan resting on an unverified outside claim to the owner', async () => {
    const rig = await rigWith();
    rig.llm.script('research', ...standardRun());
    rig.llm.script(
      'write_plan',
      todoPlan({
        outside_claims: [{ claim: 'The API is free forever.', evidence: ['E2'] }],
      }),
    );

    const id = await planThrough(rig);

    const card = await cardOf(rig, id);
    expect(card.phase).toBe('plan_ready');
    expect(card.needs_you).toBe(true);
    expect(rig.llm.callsTo('approve_plan')).toEqual([]);
    const ask = (await eventsOf(rig, id, 'needs_you')).at(-1)?.payload;
    expect(ask?.reason).toContain(
      'Plan rests on an unverified outside claim: The API is free forever.',
    );

    expect(ask?.actions).toContain('approve_plan');
  });

  it('adds no reason and lets the Director decide when every outside claim is supported', async () => {
    const rig = await rigWith();
    rig.llm.script('research', ...standardRun());
    rig.llm.script(
      'write_plan',
      todoPlan({ outside_claims: [{ claim: CLAIM, evidence: ['E1'] }] }),
    );

    const id = await planThrough(rig);

    expect((await eventsOf(rig, id, 'plan_approved'))[0]?.payload.by).toBe('director');
    expect(rig.llm.callsTo('approve_plan')).toHaveLength(1);
  });

  it('shows the approval step claim text, refs and statuses but never a quote or page text', async () => {
    const rig = await rigWith();
    rig.llm.script('research', ...standardRun());
    rig.llm.script(
      'write_plan',
      todoPlan({ outside_claims: [{ claim: CLAIM, evidence: ['E1'] }] }),
    );

    await planThrough(rig);

    const input = rig.llm.callsTo('approve_plan')[0]?.input;
    const text = JSON.stringify(input);
    expect(text).toContain(CLAIM);
    expect(pick(input, 'plan.verification.evidence.0.status')).toBe('verified');
    expect(text).not.toContain(GOOD_QUOTE);
    expect(text).not.toContain('requests per minute for every key');
  });
});

describe('research when the provider is off or down', () => {
  it('finishes with a note and no model call when there is no provider, and the plan still gets written', async () => {
    const rig = await rigWith({ research: false });
    rig.llm.script(
      'write_plan',
      todoPlan({ outside_claims: [{ claim: CLAIM, evidence: [] }] }),
    );

    const id = await planThrough(rig);

    expect(rig.llm.callsTo('research')).toEqual([]);
    const event = (await eventsOf(rig, id, 'research'))[0]?.payload;
    expect(event?.note).toMatch(/research is off/i);
    expect(event?.note).toMatch(/settings/i);
    expect(event?.claims).toEqual([]);
    expect((await planOf(rig, id))?.verification.outside_claims[0]?.status).toBe(
      'unverified',
    );

    expect((await cardOf(rig, id)).phase).toBe('plan_ready');
  });

  it('treats a project that switched research off the same way', async () => {
    const rig = await rigWith();
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { research: { enabled: false } },
      author: 'test',
      reason: 'off',
      expectedVersion: 0,
    });

    const id = await planThrough(rig);

    expect(rig.llm.callsTo('research')).toEqual([]);
    expect((await eventsOf(rig, id, 'research'))[0]?.payload.note).toMatch(/off/i);
    expect(rig.research!.searches).toEqual([]);
  });

  it('notes that the provider did not answer when every request fails, then carries on to the plan', async () => {
    const rig = await rigWith();
    rig.research!.down = true;
    rig.llm.script('research', { research_requests: [search()] }, findings([]));

    const id = await planThrough(rig);

    expect(rig.llm.callsTo('research')).toHaveLength(1);
    const event = (await eventsOf(rig, id, 'research'))[0]?.payload;
    expect(event?.note).toMatch(/did not answer/i);
    expect((await planOf(rig, id))?.version).toBe(1);
    expect((await eventsOf(rig, id, 'needs_you')).at(-1)?.payload.actions).not.toContain(
      'retry_step',
    );
  });
});

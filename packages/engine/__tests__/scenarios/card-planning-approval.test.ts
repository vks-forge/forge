/**
 * Scenario: approving a plan, behind the floor or by the owner.
 *
 * Why: the Director may approve a plan itself only when a deterministic floor passes, and the
 *   owner must always be able to approve, ask for changes or edit tickets, never meeting a
 *   dead end (d-0133, d-0135, d-0141 item 6). A floor breach (Tier C path, rejected approach,
 *   overlap with another approved card, files moved since verification), "always ask" and an
 *   `ask_owner` answer must each stop at Needs you with actions and no tickets; the owner's
 *   approve must be exact (latest version only) and idempotent; a planned non-Express ticket
 *   must be held with a way out, never silently run with too little process.
 *
 * Pins: each floor breach and always_ask leave the card in plan_ready with needs_you and the
 *   approve step unrun; ask_owner carries its questions; owner approve creates tickets once;
 *   stale and wrong-phase approvals refused. Changes, edits and held tickets are in
 *   card-planning-changes.
 * Depends on: helpers/planning-rig, helpers/rig, vitest.
 */

import type { CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  answerWith,
  cardOf,
  createPlanCard,
  eventsOf,
  oneTicketPlan,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
} from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';

describe('approval floor', () => {
  it.each([
    [
      'a Tier C path',
      async (rig: Rig) =>
        scriptTodo(rig, { write_plan: [oneTicketPlan(['.github/workflows/ci.yml'])] }),
      /Tier C/,
    ],
    [
      'a rejected approach',
      async (rig: Rig) =>
        scriptTodo(rig, {
          verify: [
            {
              findings: {
                summary: 'x',
                blast_radius: 'y',
                rejected_hits: ['r-0001 No vector memory'],
              },
            },
          ],
        }),
      /rejected/,
    ],
    [
      'files that moved since verification',
      async (rig: Rig) => {
        rig.repo.changed = ['src/store.ts'];
      },
      /changed since/,
    ],
  ])('stops at Needs you when the plan has %s', async (_name, arrange, reason) => {
    const rig = await planningRig();
    await arrange(rig);

    const id = await planUntilDecision(rig);

    const card = await cardOf(rig, id);
    expect(card.phase).toBe('plan_ready');
    expect(card.needs_you).toBe(true);
    expect(rig.llm.callsTo('approve_plan')).toEqual([]);
    expect(await tickets(rig, id)).toEqual([]);

    const ready = (await eventsOf(rig, id, 'plan_ready'))[0]?.payload;
    expect(ready?.auto_approve_eligible).toBe(false);

    const ask = (await eventsOf(rig, id, 'needs_you')).at(-1)?.payload;
    expect(ask?.actions).toEqual(['approve_plan', 'request_changes']);
    expect(ask?.reason).toMatch(reason);

    const plans = await rig.engine.cardPlans(id);
    expect(plans).toMatchObject({ status: 'ok', floor: { pass: false } });
    expect(ask?.kind).toBe('plan_approval');
    expect(ask?.title).toBe('The plan needs your approval');
    // One item per floor reason, never the reasons joined into one string.
    expect(ask?.items).toEqual(plans.status === 'ok' ? plans.floor?.reasons : []);
    expect(ask?.items?.length).toBeGreaterThan(0);
  });

  it('stops at Needs you when another approved card plans the same file', async () => {
    const rig = await planningRig();
    const first = await planUntilDecision(rig);
    expect((await cardOf(rig, first)).phase).toBe('in_progress');

    scriptTodo(rig);
    const id = await planUntilDecision(rig);

    expect((await cardOf(rig, id)).phase).toBe('plan_ready');
    const ask = (await eventsOf(rig, id, 'needs_you')).at(-1)?.payload;
    expect(ask?.reason).toContain(first);
  });

  it('always_ask never calls the approval step', async () => {
    const rig = await planningRig();
    await rig.config.append({
      scope: 'company',
      doc: { director: { approval_mode: 'always_ask' } },
      author: 'test',
      reason: 'ask',
      expectedVersion: 0,
    });

    const id = await planUntilDecision(rig);

    expect(rig.llm.callsTo('approve_plan')).toEqual([]);
    expect((await cardOf(rig, id)).phase).toBe('plan_ready');
    expect(
      (await eventsOf(rig, id, 'plan_ready'))[0]?.payload.auto_approve_eligible,
    ).toBe(false);
  });

  it('puts the approval step questions to the owner when it answers ask_owner', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      approve_plan: [
        { decision: 'ask_owner', questions: ['Is a local-only store acceptable?'] },
      ],
    });

    const id = await planUntilDecision(rig);

    expect((await cardOf(rig, id)).phase).toBe('plan_ready');
    const ask = (await eventsOf(rig, id, 'needs_you')).at(-1)?.payload;
    expect(ask?.reason).toContain('Is a local-only store acceptable?');
    expect(ask?.actions).toEqual(['approve_plan', 'request_changes']);
    expect(ask).toMatchObject({
      kind: 'director_questions',
      title: 'The Director has questions before approving',
      items: ['Is a local-only store acceptable?'],
    });
  });
});

describe('owner approval', () => {
  async function waiting(): Promise<{ rig: Rig; id: CardId }> {
    const rig = await planningRig();
    rig.repo.changed = ['src/store.ts'];
    const id = await planUntilDecision(rig);

    return { rig, id };
  }

  it('approves the latest version once and files the tickets in order', async () => {
    const { rig, id } = await waiting();

    const out = await rig.engine.approvePlan(id, 1, 'vikash');

    expect(out.status).toBe('approved');
    const filed = await tickets(rig, id);
    expect(filed).toHaveLength(2);
    expect((await eventsOf(rig, id, 'plan_approved'))[0]?.payload.by).toBe('owner');

    const again = await rig.engine.approvePlan(id, 1, 'vikash');
    expect(again.status).toBe('approved');
    expect(await tickets(rig, id)).toHaveLength(2);
    expect(await eventsOf(rig, id, 'plan_approved')).toHaveLength(1);
  });

  it('refuses a stale or unknown version, an unknown card and a card that is not waiting', async () => {
    const { rig, id } = await waiting();
    await rig.engine.requestPlanChanges(id, 1, 'split the first ticket', 'vikash');
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    expect((await rig.engine.approvePlan(id, 1, 'vikash')).status).toBe('stale_plan');
    expect((await rig.engine.approvePlan(id, 9, 'vikash')).status).toBe('stale_plan');
    expect((await rig.engine.approvePlan('FG-C99', 1, 'vikash')).status).toBe(
      'not_found',
    );

    const grilling = await createPlanCard(rig);
    expect((await rig.engine.approvePlan(grilling, 1, 'vikash')).status).toBe(
      'phase_mismatch',
    );
  });
});

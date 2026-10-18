/**
 * Scenario: the owner sends a card back to the Director from a stuck ticket (Re-plan).
 *
 * Why: when a ticket cannot be fixed by retrying, the plan itself may be wrong. Re-plan sends the
 *   card back to the Director with the owner's comment without throwing work away early: the
 *   stuck ticket stays parked, running tickets keep running, the card's not-started tickets stop
 *   being dispatched (the new plan may replace them), and only when the new version is approved
 *   are the earlier version's not-started tickets cancelled through `transition()`. Done and
 *   running tickets stay, and the planner is shown which tickets already exist so it does not
 *   plan them twice (d-0134).
 *
 * Pins: Done-when 6 (Re-plan puts the card back in grilling with a `replan_requested` event,
 *   the interaction settled `replan`; v2 approval cancels not-started v1 tickets and keeps the
 *   running one), the dispatch hold while the card is shaping (the wait line says so), the
 *   planner input listing existing tickets with their plan keys, the plan keys recorded on
 *   approval, and the Director not answering a Worker on a file that became Tier C after approval.
 * Depends on: helpers/escalation-rig, helpers/planning-rig, vitest.
 */

import { describe, expect, it, vi } from 'vitest';
import { cardEventsOf, pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  cardOf,
  eventsOf,
  oneTicketPlan,
  pick,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

// Every lane runs now, so a held lane has to be stubbed to exercise the hold path still kept for a lane without a runner.
vi.mock('#/domain/live-lanes.js', () => ({
  LIVE_LANES: ['express', 'standard'],
  isLive: (lane: string) => lane !== 'full',
}));

const ticketPlan = (key: string, lane: string, files: string[]) => ({
  key,
  title: `Ticket ${key}`,
  body: `Do ${key}.`,
  acceptance: [`${key} works`],
  priority: key === 't1' ? 'high' : key === 't2' ? 'normal' : 'low',
  depends_on: [],
  lane,
  size: 'S',
  files,
});

/** A card with t1 held (full lane), t2 running and t3 waiting for the one project slot. */
async function stuckCard() {
  const rig = await planningRig();
  const v1 = todoPlan({
    tickets: [
      ticketPlan('t1', 'full', ['src/a.ts']),
      ticketPlan('t2', 'express', ['src/b.ts']),
      ticketPlan('t3', 'express', ['src/c.ts']),
    ],
  });

  const v2 = todoPlan({ tickets: [ticketPlan('t1', 'express', ['src/a.ts'])] });
  scriptTodo(rig, { write_plan: [v1, v2] });
  const card = await planUntilDecision(rig);
  await rig.tick();
  const [t1, t2, t3] = await tickets(rig, card);
  const [hold] = await pendingOf(rig, t1!.id, 'failure');

  return { rig, card, t1: t1!, t2: t2!, t3: t3!, hold: hold! };
}

describe('Re-plan', () => {
  it('sends the card back to grilling, settles the escalation and keeps every ticket as it is', async () => {
    const { rig, card, t1, t2, t3, hold } = await stuckCard();
    expect((await rig.ticket(t2.id)).status).toBe('in_progress');
    expect((await rig.ticket(t3.id)).status).toBe('planned');

    const done = await rig.engine.actOnEscalation(
      hold.id,
      { action: 'replan', comment: 'Split the heavy part off' },
      'owner',
    );

    expect(done.status).toBe('done');
    expect((await cardOf(rig, card)).phase).toBe('grilling');
    const requested = await cardEventsOf(rig, card, 'replan_requested');
    expect(requested[0]!.payload).toEqual({
      ticket_id: t1.id,
      comment: 'Split the heavy part off',
      by: 'owner',
    });

    const settled = await rig.storage.transaction((tx) => tx.interactions.get(hold.id));
    expect(settled).toMatchObject({
      status: 'answered',
      answer: { action: 'replan', by: 'owner', comment: 'Split the heavy part off' },
    });

    // Nothing is cancelled before the new plan is approved.
    expect((await rig.ticket(t1.id)).status).toBe('waiting_human');
    expect((await rig.ticket(t2.id)).status).toBe('in_progress');
    expect((await rig.ticket(t3.id)).status).toBe('planned');
  });

  it('holds the not-started tickets while the card is being shaped, and says why', async () => {
    const { rig, t3, hold } = await stuckCard();
    expect(await rig.engine.explainWait(t3.id)).toMatch(/^cap:/);

    await rig.engine.actOnEscalation(
      hold.id,
      { action: 'replan', comment: 'Split the heavy part off' },
      'owner',
    );

    expect(await rig.engine.explainWait(t3.id)).toBe(
      'plan: the card is being re-planned',
    );
  });

  it('shows the planner the existing tickets, then v2 approval cancels the not-started v1 tickets', async () => {
    const { rig, card, t1, t2, t3, hold } = await stuckCard();
    await rig.engine.actOnEscalation(
      hold.id,
      { action: 'replan', comment: 'Split the heavy part off' },
      'owner',
    );

    await rig.tick();
    if ((await cardOf(rig, card)).phase === 'plan_ready') {
      expect((await rig.engine.approvePlan(card, 2, 'owner')).status).toBe('approved');
    }

    const input = rig.llm.callsTo('write_plan').at(-1)!.input;
    const existing = pick(input, 'existing_tickets') as {
      id: string;
      status: string;
      plan_key: string;
    }[];

    expect(existing.map((e) => [e.id, e.plan_key])).toEqual([
      [t1.id, 't1'],
      [t2.id, 't2'],
      [t3.id, 't3'],
    ]);

    expect((await cardOf(rig, card)).phase).not.toBe('grilling');
    expect((await rig.ticket(t1.id)).status).toBe('cancelled');
    expect((await rig.ticket(t3.id)).status).toBe('cancelled');
    expect((await rig.ticket(t2.id)).status).toBe('in_progress');

    const all = await tickets(rig, card);
    expect(all).toHaveLength(4);
    const note = (await eventsOf(rig, card, 'note')).find((e) =>
      e.payload.text.startsWith('Replaced by plan v2'),
    );

    expect(note?.payload.text).toContain(t1.id);
    expect(note?.payload.text).toContain(t3.id);
    const approved = (await eventsOf(rig, card, 'plan_approved')).map((e) => e.payload);
    expect(approved[0]).toMatchObject({ version: 1, plan_keys: ['t1', 't2', 't3'] });
    expect(approved.at(-1)).toMatchObject({ version: 2, plan_keys: ['t1'] });
  });
});

describe('a Worker question on a file that became Tier C', () => {
  it('is never answered alone, even though the ticket was predicted Tier A', async () => {
    const rig = await planningRig();
    scriptTodo(rig, { write_plan: [oneTicketPlan(['src/policy/floor.ts'])] });
    const card = await planUntilDecision(rig);
    await rig.tick();
    const [t] = await tickets(rig, card);
    expect(t!.tier_predicted).toBe('A');

    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { tier_c_globs: ['src/policy/**'] },
      author: 'test',
      reason: 'policy path became Tier C',
      expectedVersion: 0,
    });

    rig.llm.script('ticket_answer', {
      decision: 'answer',
      answer: 'Yes.',
      confidence: 0.99,
      grounds: [{ kind: 'plan', ref: 't1' }],
    });

    const runId = (await rig.ticket(t!.id)).assignee_run_id!;
    await rig.storage.transaction((tx) =>
      tx.interactions.insert({
        id: 'int-q1',
        ticket_id: t!.id,
        run_id: runId,
        kind: 'question',
        payload: { prompt: 'Delete the floor?' },
        status: 'pending',
        asked_at: new Date(rig.clock.now()).toISOString(),
        timeout_at: new Date(rig.clock.now() + 3_600_000).toISOString(),
      }),
    );

    rig.driver.emit(runId, {
      type: 'ask',
      interaction_id: 'int-q1',
      kind: 'question',
      prompt: 'Delete the floor?',
    });

    rig.driver.finish(
      runId,
      makeResult({
        status: 'paused',
        pauseReason: 'interaction',
        interactionId: 'int-q1',
        session: 'sess-A',
      }),
    );

    await rig.flush();
    await rig.tick();

    const row = await rig.storage.transaction((tx) => tx.interactions.get('int-q1'));
    expect(row?.status).toBe('pending');
    expect(row?.escalated_at).toBeDefined();
    // The model also saw the ticket's plan entry, so it could cite the plan.
    const input = rig.llm.callsTo('ticket_answer')[0]!.input;
    expect(pick(input, 'ticket.planned_files')).toEqual(['src/policy/floor.ts']);
  });
});

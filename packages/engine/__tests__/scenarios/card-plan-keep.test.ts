/**
 * Scenario: a re-plan never cancels tickets that have started, and never cancels silently.
 *
 * Why: approving plan v4 of card CHE-C1 cancelled CHE-3 (planned after a retry, with a run, a
 *   branch and a worktree) and CHE-6 (waiting on the owner, with a run) because the engine only
 *   looked at their status while the Director believed they were in flight. Work that started must
 *   stay, the planner must be told which tickets stay and which are replaced, and a plan that would
 *   cancel untouched tickets without covering their work must reach the owner instead of being
 *   approved by the Director.
 *
 * Pins: a planned ticket with a run and branch and a waiting ticket with a run survive approval of
 *   a plan that omits both; a never-started ticket is still cancelled; the planner input carries
 *   kept and will_be_replaced; the Director does not approve while a cancelled ticket is not
 *   covered (it asks the owner, who can still approve), and approves when the plan names the ticket
 *   as dropped; the plan read lists what will be cancelled and what is not covered.
 * Depends on: helpers/planning-rig, vitest.
 */

import { describe, expect, it, vi } from 'vitest';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  cardOf,
  eventsOf,
  pick,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';

// A Full ticket is held with an escalation, which gives the owner the Re-plan action the scenario needs.
vi.mock('#/domain/live-lanes.js', () => ({
  LIVE_LANES: ['express', 'standard'],
  isLive: (lane: string) => lane !== 'full',
}));

const entry = (key: string, file: string, lane = 'express') => ({
  key,
  title: `Ticket ${key}`,
  body: `Do ${key}.`,
  acceptance: [`${key} works`],
  priority: 'normal',
  depends_on: [],
  lane,
  size: 'S',
  files: [file],
});

/**
 * Plan v1 (t1..t4) approved by the owner; t1 planned with a run and branch, t2 waiting with a run, t3 untouched,
 * t4 held in the Full lane (the owner re-plans from its hold; `originRun` gives it a run too).
 */
async function startedCard(
  v2: (dropped: string[]) => Record<string, unknown>,
  originRun = false,
) {
  const rig = await planningRig();
  rig.repo.changed = ['src/a.ts'];
  scriptTodo(rig, {
    write_plan: [
      todoPlan({
        tickets: [
          entry('t1', 'src/a.ts'),
          entry('t2', 'src/b.ts'),
          entry('t3', 'src/c.ts'),
          entry('t4', 'src/d.ts', 'full'),
        ],
      }),
    ],
  });

  const card = await planUntilDecision(rig);
  await rig.engine.approvePlan(card, 1, 'owner');
  const [t1, t2, t3, t4] = await tickets(rig, card);
  const [hold] = await pendingOf(rig, t4!.id, 'failure');
  await rig.storage.transaction(async (tx) => {
    for (const [t, patch] of [
      [t1!, { status: 'planned' as const, branch: 'feat/a', worktree: '/wt/a' }],
      [t2!, { status: 'waiting_human' as const }],
    ] as const) {
      const cur = (await tx.tickets.get(t.id))!;
      await tx.tickets.updateTicketCas(t.id, cur.status_version, patch);
    }

    for (const t of originRun ? [t1!, t2!, t4!] : [t1!, t2!]) {
      await tx.runs.insert({
        id: `run-of-${t.id}`,
        ticket_id: t.id,
        harness: 'scripted',
        driver_version: '1',
        cwd: '/tmp/x',
        lane: 'express',
        started_at: '2026-10-16T00:00:00.000Z',
        status: 'error',
        owner: 'srv',
      });
    }
  });

  scriptTodo(rig, {
    grill_turn: [
      { done: true, done_reason: 'nothing_open', open_points: 0, assumptions: [] },
    ],
    write_plan: [v2([t3!.id, t4!.id])],
  });

  rig.repo.changed = [];

  return { rig, card, t1: t1!, t2: t2!, t3: t3!, t4: t4!, hold: hold! };
}

/** Re-plans through the hold's Re-plan action so the card writes v2, then ticks to the Director's decision. */
async function replan(rig: Rig, holdId: string) {
  await rig.engine.actOnEscalation(
    holdId,
    { action: 'replan', comment: 'Rework the plan' },
    'owner',
  );

  await rig.tick();
}

const v2Plan = (over: Record<string, unknown> = {}) =>
  todoPlan({ tickets: [entry('t9', 'src/new.ts')], ...over });

describe('re-plan keeps started tickets', () => {
  it('leaves a planned ticket with a run and branch and a waiting ticket with a run alone, and cancels the untouched one', async () => {
    const { rig, card, t1, t2, t3, t4, hold } = await startedCard(() => v2Plan());
    await replan(rig, hold.id);

    expect((await cardOf(rig, card)).phase).toBe('plan_ready');
    const approved = await rig.engine.approvePlan(card, 2, 'owner');

    expect(approved.status).toBe('approved');
    expect((await rig.ticket(t1.id)).status).toBe('planned');
    expect((await rig.ticket(t2.id)).status).toBe('waiting_human');
    expect((await rig.ticket(t3.id)).status).toBe('cancelled');
    expect((await rig.ticket(t4.id)).status).toBe('cancelled');
  });

  it('tells the planner which tickets stay and which are replaced', async () => {
    const { rig, t1, t2, t3, t4, hold } = await startedCard(() => v2Plan());
    await replan(rig, hold.id);

    const existing = pick(
      rig.llm.callsTo('write_plan').at(-1)!.input,
      'existing_tickets',
    ) as { id: string; kept: boolean; will_be_replaced: boolean }[];

    expect(existing.map((e) => [e.id, e.kept, e.will_be_replaced])).toEqual([
      [t1.id, true, false],
      [t2.id, true, false],
      [t3.id, false, true],
      [t4.id, false, true],
    ]);
  });

  it('does not let the Director approve while a cancelled ticket is not covered, but lets the owner', async () => {
    const { rig, card, t3, t4, hold } = await startedCard(() => v2Plan());
    await replan(rig, hold.id);

    expect((await cardOf(rig, card)).phase).toBe('plan_ready');
    expect(rig.llm.callsTo('approve_plan')).toHaveLength(0);
    const read = await rig.engine.cardPlans(card);

    expect(read.status).toBe('ok');
    if (read.status === 'ok') {
      expect(read.floor?.reasons.join(' ')).toContain(t3.id);
      expect(read.will_cancel.map((t) => t.id)).toEqual([t3.id, t4.id]);
      expect(read.not_covered.map((t) => t.id)).toEqual([t3.id, t4.id]);
    }

    expect((await rig.engine.approvePlan(card, 2, 'owner')).status).toBe('approved');
  });

  it('lets the Director approve when the plan names the cancelled ticket as dropped', async () => {
    const { rig, card, t3, hold } = await startedCard((ids) =>
      v2Plan({ non_goals: ids.map((id) => `${id} is dropped on purpose`) }),
    );

    await replan(rig, hold.id);

    expect(rig.llm.callsTo('approve_plan').length).toBeGreaterThan(0);
    expect(await eventsOf(rig, card, 'plan_approved')).toHaveLength(2);
    expect((await rig.ticket(t3.id)).status).toBe('cancelled');
  });

  it('replaces the ticket the owner re-planned from even though it has a run, and still checks its coverage', async () => {
    const { rig, card, t4, hold } = await startedCard(() => v2Plan(), true);
    await replan(rig, hold.id);

    const read = await rig.engine.cardPlans(card);

    expect(rig.llm.callsTo('approve_plan')).toHaveLength(0);
    expect(read.status === 'ok' && read.will_cancel.map((t) => t.id)).toContain(t4.id);
    expect(read.status === 'ok' && read.not_covered.map((t) => t.id)).toContain(t4.id);
    await rig.engine.approvePlan(card, 2, 'owner');

    expect((await rig.ticket(t4.id)).status).toBe('cancelled');
  });

  it('refuses Director approval and lists a kept ticket whose plan key the new plan reuses', async () => {
    const { rig, card, t1, hold } = await startedCard((ids) =>
      todoPlan({
        tickets: [entry('t1', 'src/new.ts')],
        non_goals: ids.map((id) => `${id} is dropped on purpose`),
      }),
    );

    await replan(rig, hold.id);

    const read = await rig.engine.cardPlans(card);

    expect(rig.llm.callsTo('approve_plan')).toHaveLength(0);
    expect(read.status === 'ok' && read.already_exists.map((t) => t.id)).toEqual([t1.id]);
    expect(read.status === 'ok' && read.floor?.reasons.join(' ')).toContain(
      `Already exists: ${t1.id}`,
    );
  });

  it('reads an already-approved current plan with its floor frozen: its own tickets never count as existing', async () => {
    const rig = await planningRig();
    rig.repo.changed = ['src/a.ts'];
    const card = await planUntilDecision(rig);
    await rig.engine.approvePlan(card, 1, 'owner');
    rig.repo.changed = [];

    const read = await rig.engine.cardPlans(card);

    expect(read.status === 'ok' && read.already_exists).toEqual([]);
    expect(read.status === 'ok' && read.floor).toBeNull();
  });
});

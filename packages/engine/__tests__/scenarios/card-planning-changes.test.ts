/**
 * Scenario: asking for changes, editing tickets and holding tickets for a pipeline.
 *
 * Why: the owner stays in charge of a ready plan (d-0133). Request changes must re-grill on the
 *   comment only and write version 2 with a computed diff; light ticket edits must write a new
 *   owner version (never change one already read) and refuse what would leave a ticket waiting on
 *   something removed; and a planned non-Express ticket must be held with a way out (Run as Express)
 *   because only Express runs today, never silently run with too little process (d-0135). A lane can
 *   only be raised by the deterministic pre-check, so a Tier C file makes an Express ticket Full.
 *
 * Pins: v2 with a diff and the re-grill input; short comment and stale version; edit, reorder and
 *   remove into an owner version; dependents, bad order, empty plan and unknown ticket refusals;
 *   held tickets with run-as-Express; lane raised by Tier C.
 * Depends on: helpers/planning-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  cardOf,
  eventsOf,
  oneTicketPlan,
  pick,
  planOf,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';

describe('request changes and ticket edits', () => {
  it('re-grills on the comment and writes version 2 with a diff', async () => {
    const rig = await planningRig();
    rig.repo.changed = ['src/store.ts'];
    const id = await planUntilDecision(rig);

    const out = await rig.engine.requestPlanChanges(
      id,
      1,
      'Please add a delete button',
      'vikash',
    );

    expect(out.status).toBe('requested');
    expect((await cardOf(rig, id)).phase).toBe('grilling');
    expect((await eventsOf(rig, id, 'plan_changes_requested'))[0]?.payload).toEqual({
      version: 1,
      comment: 'Please add a delete button',
    });

    scriptTodo(rig, {
      grill_turn: [
        { done: true, done_reason: 'nothing_open', open_points: 0, assumptions: [] },
      ],
      write_plan: [
        todoPlan({
          goal: 'A todo application with delete',
          scope: ['list', 'add', 'delete'],
        }),
      ],
    });

    await rig.tick();

    const turn = rig.llm.callsTo('grill_turn').at(-1)?.input;
    expect(pick(turn, 'changes_requested')).toMatchObject({
      version: 1,
      comment: 'Please add a delete button',
    });

    const v2 = await planOf(rig, id, 2);
    expect(v2?.diff_from_previous?.map((d) => d.field)).toEqual(['goal', 'scope']);
    expect((await cardOf(rig, id)).phase).toBe('plan_ready');
    expect(await tickets(rig, id)).toEqual([]);
  });

  it('refuses a short comment and a card that is not waiting', async () => {
    const rig = await planningRig();
    rig.repo.changed = ['src/store.ts'];
    const id = await planUntilDecision(rig);

    expect((await rig.engine.requestPlanChanges(id, 1, 'no', 'v')).status).toBe(
      'invalid_comment',
    );

    expect(
      (await rig.engine.requestPlanChanges(id, 5, 'change something', 'v')).status,
    ).toBe('stale_plan');
  });

  it('edits tickets into a new owner version: rename, priority, reorder, remove', async () => {
    const rig = await planningRig();
    rig.repo.changed = ['src/store.ts'];
    scriptTodo(rig, {
      write_plan: [
        todoPlan({
          tickets: [
            { ...((todoPlan().tickets as object[])[0] as object) },
            { ...((todoPlan().tickets as object[])[1] as object), depends_on: [] },
            {
              ...((todoPlan().tickets as object[])[1] as object),
              key: 't3',
              depends_on: ['t2'],
            },
          ],
        }),
      ],
    });

    const id = await planUntilDecision(rig);

    const out = await rig.engine.editPlanTickets(
      id,
      1,
      {
        tickets: [
          { key: 't1', title: 'Store layer', priority: 'urgent' },
          { key: 't3', removed: true },
        ],
        order: ['t2', 't1'],
      },
      'vikash',
    );

    expect(out.status).toBe('edited');
    const v2 = await planOf(rig, id, 2);
    expect(v2?.author).toBe('owner');
    expect(v2?.tickets.map((t) => [t.key, t.title, t.priority])).toEqual([
      ['t2', 'Ticket t2', 'normal'],
      ['t1', 'Store layer', 'urgent'],
    ]);

    expect(v2?.diff_from_previous?.map((d) => d.field)).toEqual(
      expect.arrayContaining(['tickets.t1', 'tickets.t3', 'tickets.order']),
    );

    expect((await rig.engine.approvePlan(id, 1, 'v')).status).toBe('stale_plan');
  });

  it('refuses removing a ticket others depend on, a bad order and an empty plan', async () => {
    const rig = await planningRig();
    rig.repo.changed = ['src/store.ts'];
    const id = await planUntilDecision(rig);

    expect(
      await rig.engine.editPlanTickets(
        id,
        1,
        { tickets: [{ key: 't1', removed: true }] },
        'v',
      ),
    ).toMatchObject({ status: 'ticket_has_dependents', key: 't1', dependents: ['t2'] });

    expect(
      (await rig.engine.editPlanTickets(id, 1, { tickets: [], order: ['t1'] }, 'v'))
        .status,
    ).toBe('invalid_order');

    expect(
      (
        await rig.engine.editPlanTickets(
          id,
          1,
          {
            tickets: [
              { key: 't2', removed: true },
              { key: 't1', removed: true },
            ],
          },
          'v',
        )
      ).status,
    ).toBe('empty_plan');

    expect(
      (
        await rig.engine.editPlanTickets(
          id,
          1,
          { tickets: [{ key: 't9', title: 'x' }] },
          'v',
        )
      ).status,
    ).toBe('unknown_ticket');
  });
});

describe('held tickets', () => {
  it('holds a planned non-Express ticket with a Run as Express action and releases it', async () => {
    const rig = await planningRig();
    const heavy = todoPlan();
    (heavy['tickets'] as { lane: string }[])[1]!.lane = 'standard';
    scriptTodo(rig, { write_plan: [heavy] });

    const id = await planUntilDecision(rig);
    const [first, second] = await tickets(rig, id);

    expect(['planned', 'in_progress']).toContain(first?.status);
    expect(first?.lane).toBe('express');
    expect(second).toMatchObject({ status: 'waiting_human', lane: 'standard' });
    expect(second?.blocked_reason).toMatch(/^pipeline_pending/);

    const ask = (await eventsOf(rig, id, 'needs_you')).find((e) => e.payload.ticket_id);
    expect(ask?.payload).toMatchObject({
      actions: ['run_as_express'],
      ticket_id: second?.id,
    });

    const out = await rig.engine.runAsExpress(second?.id ?? '', 'vikash');
    expect(out.status).toBe('released');
    expect(await rig.ticket(second?.id ?? '')).toMatchObject({
      status: 'planned',
      lane: 'express',
    });

    expect((await rig.engine.runAsExpress(first?.id ?? '', 'vikash')).status).toBe(
      'not_held',
    );

    expect((await rig.engine.runAsExpress('FG-999', 'vikash')).status).toBe('not_found');
  });

  it('can only raise a lane: a Tier C file makes an Express ticket Full and held', async () => {
    const rig = await planningRig();
    rig.repo.changed = ['x'];
    scriptTodo(rig, { write_plan: [oneTicketPlan(['.claude/settings.json'])] });

    const id = await planUntilDecision(rig);
    expect(await rig.engine.approvePlan(id, 1, 'vikash')).toMatchObject({
      status: 'approved',
    });

    const [t] = await tickets(rig, id);
    expect(t).toMatchObject({
      lane: 'full',
      tier_predicted: 'C',
      status: 'waiting_human',
    });
  });
});

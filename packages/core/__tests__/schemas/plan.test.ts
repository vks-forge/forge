/**
 * Tests for the plan and planning-event schemas.
 *
 * Why: a stored plan is what the owner approves and what tickets are made from, and the card
 *   history shows the planning steps as events. A plan with a loop, a ticket key that is not
 *   `t<n>` or an event payload missing the evidence the page renders (the files read, the
 *   config version, the recommended option) must not be storable, or approval and the Card
 *   page would break on data the system itself wrote.
 *
 * Pins: a valid plan parses; ticket key shape, loops and unknown dependencies are refused;
 *   every new card event kind accepts its contract payload and refuses a broken one;
 *   `needs_you` run_as_express needs its ticket; the empty grill state parses to defaults.
 * Depends on: src/schemas/plan, src/schemas/card-event, src/schemas/grill, vitest.
 */

import { describe, expect, it } from 'vitest';
import { NewCardEvent } from '#/schemas/card-event.js';
import { GrillState } from '#/schemas/grill.js';
import { PlanVersion } from '#/schemas/plan.js';
import { plan, ticket } from '#tests/helpers/plan-fixtures.js';

const ev = (kind: string, payload: unknown) =>
  NewCardEvent.safeParse({
    kind,
    at: '2026-10-16T10:00:00.000Z',
    actor: { type: 'director', id: 'engine' },
    payload,
  });

describe('PlanVersion', () => {
  it('parses a valid plan and round-trips through JSON', () => {
    const p = plan();

    expect(PlanVersion.parse(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('refuses a ticket key that is not t<n>, a loop and an unknown dependency', () => {
    expect(() => plan({ tickets: [ticket('x1')] })).toThrow();
    expect(() =>
      plan({
        tickets: [
          ticket('t1', { depends_on: ['t2'] }),
          ticket('t2', { depends_on: ['t1'] }),
        ],
      }),
    ).toThrow();

    expect(() => plan({ tickets: [ticket('t1', { depends_on: ['t7'] })] })).toThrow();
  });
});

describe('planning card events', () => {
  const option = (id: string, recommended: boolean) => ({ id, label: id, recommended });

  it('accepts a grill question with 2-4 options and one recommended', () => {
    const ok = ev('grill_question', {
      question_id: 'q1',
      text: 'Which storage?',
      options: [option('o1', true), option('o2', false)],
      allow_other: true,
      open_points: 3,
    });

    expect(ok.success).toBe(true);
    expect(
      ev('grill_question', {
        question_id: 'q1',
        text: 'x',
        options: [option('o1', false), option('o2', false)],
        allow_other: true,
        open_points: 1,
      }).success,
    ).toBe(false);
  });

  it('accepts the other planning kinds with their payloads', () => {
    const cases: [string, unknown][] = [
      ['step_started', { step_id: 'survey', step_kind: 'survey', label: 'Survey' }],
      [
        'step_finished',
        {
          step_id: 'survey',
          step_kind: 'survey',
          label: 'Survey',
          files_read: [{ path: 'package.json', bytes: 120 }],
          config_version: 0,
          summary: 'empty repo',
        },
      ],
      ['grill_answer', { question_id: 'q1', option_id: 'o1', by: 'owner' }],
      ['grill_done', { reason: 'zero_question', assumptions: [] }],
      ['plan_ready', { version: 1, ticket_count: 3, auto_approve_eligible: true }],
      ['plan_approved', { version: 1, by: 'director', ticket_ids: ['SF-1', 'SF-2'] }],
      ['plan_changes_requested', { version: 1, comment: 'split the first ticket' }],
      ['needs_you', { reason: 'Answer the question', actions: ['answer'] }],
    ];

    for (const [kind, payload] of cases) {
      expect(ev(kind, payload).success, kind).toBe(true);
    }
  });

  it('refuses a step_finished without its evidence and a bad grill_done reason', () => {
    expect(
      ev('step_finished', { step_id: 'a', step_kind: 'survey', label: 'x' }).success,
    ).toBe(false);

    expect(ev('grill_done', { reason: 'bored', assumptions: [] }).success).toBe(false);
  });

  it('needs the ticket when needs_you offers run_as_express', () => {
    expect(ev('needs_you', { reason: 'held', actions: ['run_as_express'] }).success).toBe(
      false,
    );

    expect(
      ev('needs_you', {
        reason: 'held',
        actions: ['run_as_express'],
        ticket_id: 'SF-4',
      }).success,
    ).toBe(true);
  });
});

describe('GrillState', () => {
  it('reads the empty document a card starts with as defaults', () => {
    const s = GrillState.parse({});

    expect(s).toMatchObject({
      current: null,
      answers: [],
      open_points: null,
      done: false,
      director_spend_usd: 0,
      step_decisions: {},
    });
  });
});

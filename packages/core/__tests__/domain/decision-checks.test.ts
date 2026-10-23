/**
 * Tests for the check that a written plan keeps the owner's grill answers.
 *
 * Why: the owner's answers are the one input the plan must never contradict. The planner now has to
 *   account for each answer, and the engine does not trust "honoured": a non-goal that negates the
 *   answer is flagged, so the card stops at Needs you showing the conflict instead of filing
 *   tickets the owner ruled out (T6 in the eval). A flag only asks the owner; it never blocks.
 *
 * Pins: a missing check index is an invalid output; every index present passes; a `conflict`
 *   verdict and a negating non-goal are conflicts, an unrelated non-goal and a non-negating one are
 *   not; checks beyond the answers are ignored.
 * Depends on: src/domain/decision-checks, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  findDecisionConflicts,
  missingDecisionIndexes,
  writePlanOutputFor,
} from '#/domain/decision-checks.js';
import type { DecisionCheck } from '#/schemas/director-steps.js';

const PLAN_BODY = {
  summary: 's',
  goal: 'g',
  scope: [],
  non_goals: [],
  assumptions: [],
  risks: [],
  tickets: [
    {
      key: 't1',
      title: 'T',
      body: 'b',
      acceptance: [],
      priority: 'normal',
      depends_on: [],
      lane: 'express',
      size: 'S',
      files: [],
    },
  ],
  card_links: [],
};

const decisions = [
  { question: 'Where are todos stored?', answer: 'Local storage in the browser' },
  { question: 'Show completed todos?', answer: 'Keep completed todos visible' },
];

const honoured: DecisionCheck[] = [
  { index: 0, status: 'honoured', where: 'scope' },
  { index: 1, status: 'honoured', where: 'scope' },
];

describe('writePlanOutputFor', () => {
  it('rejects a plan that leaves out the check of one decision, naming the missing index', () => {
    const r = writePlanOutputFor(2).safeParse({
      ...PLAN_BODY,
      decision_checks: [{ index: 0, status: 'honoured', where: 'scope' }],
    });

    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('missing index 1');
  });

  it('accepts a plan with a check for every decision, and any plan when there are none', () => {
    const full = writePlanOutputFor(2).safeParse({
      ...PLAN_BODY,
      decision_checks: [
        { index: 0, status: 'honoured', where: 'scope' },
        { index: 1, status: 'conflict', where: 't1 hides them' },
      ],
    });

    expect(full.success).toBe(true);
    expect(writePlanOutputFor(0).safeParse(PLAN_BODY).success).toBe(true);
  });
});

describe('missingDecisionIndexes', () => {
  it('lists the uncovered positions in order', () => {
    expect(
      missingDecisionIndexes(4, [{ index: 2, status: 'honoured', where: 'x' }]),
    ).toEqual([0, 1, 3]);
  });
});

describe('findDecisionConflicts', () => {
  it('reports a decision the planner itself marked as a conflict, with where', () => {
    const out = findDecisionConflicts(
      decisions,
      [
        { index: 0, status: 'honoured', where: 'scope' },
        { index: 1, status: 'conflict', where: 't2 deletes them' },
      ],
      [],
    );

    expect(out).toEqual([{ ...decisions[1], where: 't2 deletes them' }]);
  });

  it('flags an honoured decision a non-goal negates by the same key words', () => {
    const out = findDecisionConflicts(decisions, honoured, [
      'No local storage in the browser, use a server',
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]?.question).toBe('Where are todos stored?');
    expect(out[0]?.where).toContain('non_goals: No local storage');
  });

  it('leaves alone a non-goal about something else and one that does not negate', () => {
    expect(
      findDecisionConflicts(decisions, honoured, [
        'sync between devices',
        'No analytics',
        'Local storage in the browser is the plan',
      ]),
    ).toEqual([]);
  });

  it('ignores a check whose index is not a decision', () => {
    expect(
      findDecisionConflicts(
        decisions,
        [...honoured, { index: 9, status: 'conflict', where: 'x' }],
        [],
      ),
    ).toEqual([]);
  });
});

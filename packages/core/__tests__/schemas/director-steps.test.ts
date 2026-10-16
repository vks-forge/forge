/**
 * Tests for the planning step output schemas.
 *
 * Why: each planning step's answer is untrusted model text that the engine acts on: a grill
 *   question without a recommended option would break the "use recommendations" shortcut, a
 *   plan whose tickets loop would deadlock approval, and an approval step that said
 *   `ask_owner` with no question would leave the owner with nothing to answer. The schemas
 *   refuse each of those at the boundary.
 *
 * Pins: survey/verify need reads or findings; read requests are capped; grill turn rules
 *   (question when unfinished, reason when done, 2-4 options with exactly one recommended);
 *   write_plan ticket graph validation; approve_plan ask_owner needs questions; every
 *   step output converts to JSON Schema (the harness needs it).
 * Depends on: src/schemas/director-steps, src/schemas/steps, vitest, zod.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApprovePlanOutput,
  CardSurveyOutput,
  CustomStepOutput,
  EnhanceOutput,
  GrillTurnOutput,
  VerifyOutput,
  WritePlanOutput,
} from '#/schemas/director-steps.js';
import { ticket } from '#tests/helpers/plan-fixtures.js';

const q = (recommended: boolean[]) => ({
  text: 'Which storage?',
  options: recommended.map((r, i) => ({ label: `option ${i}`, recommended: r })),
});

describe('card_survey and verify outputs', () => {
  it('accept read requests alone and findings alone, and refuse neither', () => {
    expect(
      CardSurveyOutput.safeParse({
        read_requests: [{ op: 'read', path: 'package.json' }],
      }).success,
    ).toBe(true);

    expect(
      CardSurveyOutput.safeParse({ findings: { summary: 'empty repo' } }).success,
    ).toBe(true);

    expect(CardSurveyOutput.safeParse({}).success).toBe(false);
    expect(VerifyOutput.safeParse({ read_requests: [] }).success).toBe(false);
  });

  it('cap one round at 20 reads and know three operations only', () => {
    const many = Array.from({ length: 21 }, () => ({ op: 'glob', pattern: '**' }));

    expect(VerifyOutput.safeParse({ read_requests: many }).success).toBe(false);
    expect(
      VerifyOutput.safeParse({ read_requests: [{ op: 'write', path: 'x' }] }).success,
    ).toBe(false);
  });
});

describe('grill_turn output', () => {
  const base = { open_points: 2, assumptions: [] };

  it('needs a question while unfinished and a reason when done', () => {
    expect(GrillTurnOutput.safeParse({ ...base, done: false }).success).toBe(false);
    expect(GrillTurnOutput.safeParse({ ...base, done: true }).success).toBe(false);
    expect(
      GrillTurnOutput.safeParse({ ...base, done: false, question: q([true, false]) })
        .success,
    ).toBe(true);

    expect(
      GrillTurnOutput.safeParse({ ...base, done: true, done_reason: 'zero_question' })
        .success,
    ).toBe(true);
  });

  it.each([
    ['no recommended option', [false, false]],
    ['two recommended options', [true, true]],
    ['one option only', [true]],
    ['five options', [true, false, false, false, false]],
  ])('refuses a question with %s', (_n, flags) => {
    expect(
      GrillTurnOutput.safeParse({ ...base, done: false, question: q(flags) }).success,
    ).toBe(false);
  });
});

describe('write_plan output', () => {
  const body = {
    summary: 's',
    goal: 'g',
    scope: [],
    non_goals: [],
    assumptions: [],
    risks: [],
    card_links: [],
  };

  it('accepts ordered tickets with dependencies', () => {
    const tickets = [ticket('t1'), ticket('t2', { depends_on: ['t1'] })];

    expect(WritePlanOutput.safeParse({ ...body, tickets }).success).toBe(true);
  });

  it.each([
    [
      'a dependency loop',
      [ticket('t1', { depends_on: ['t2'] }), ticket('t2', { depends_on: ['t1'] })],
    ],
    ['an unknown dependency', [ticket('t1', { depends_on: ['t9'] })]],
    ['duplicate keys', [ticket('t1'), ticket('t1')]],
    ['no tickets', []],
  ])('refuses %s', (_n, tickets) => {
    expect(WritePlanOutput.safeParse({ ...body, tickets }).success).toBe(false);
  });
});

describe('approve_plan output', () => {
  it('needs a question when it asks the owner', () => {
    expect(
      ApprovePlanOutput.safeParse({ decision: 'ask_owner', questions: [] }).success,
    ).toBe(false);

    expect(
      ApprovePlanOutput.safeParse({ decision: 'approve', questions: [] }).success,
    ).toBe(true);
  });
});

describe('JSON Schema', () => {
  it.each([
    ['card_survey', CardSurveyOutput],
    ['verify', VerifyOutput],
    ['grill_turn', GrillTurnOutput],
    ['enhance', EnhanceOutput],
    ['write_plan', WritePlanOutput],
    ['approve_plan', ApprovePlanOutput],
    ['custom_step', CustomStepOutput],
  ])('%s output can be sent to the harness as a JSON Schema', (_n, schema) => {
    expect(() => z.toJSONSchema(schema, { target: 'draft-7' })).not.toThrow();
  });
});

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
  TicketAnswerOutput,
  TicketRecoverOutput,
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

describe('ticket_answer output', () => {
  const answer = {
    decision: 'answer',
    answer: 'Use SQLite, as d-0012 decided.',
    confidence: 0.9,
    grounds: [{ kind: 'decision', ref: 'd-0012' }],
  };

  it('accepts an answer with grounds and an escalation with options', () => {
    expect(TicketAnswerOutput.safeParse(answer).success).toBe(true);
    expect(
      TicketAnswerOutput.safeParse({
        decision: 'escalate',
        confidence: 0.4,
        grounds: [],
        escalate_reason: 'low_confidence',
        suggested_answer: 'SQLite',
        options: [
          { id: 'a', label: 'SQLite', recommended: true },
          { id: 'b', label: 'Postgres', recommended: false },
        ],
      }).success,
    ).toBe(true);
  });

  it('refuses an answer decision with no answer text', () => {
    const { answer: _a, ...noText } = answer;
    void _a;

    expect(TicketAnswerOutput.safeParse(noText).success).toBe(false);
  });

  it('refuses confidence outside 0 to 1, unknown ground kinds and unknown reasons', () => {
    expect(TicketAnswerOutput.safeParse({ ...answer, confidence: 1.2 }).success).toBe(
      false,
    );

    expect(
      TicketAnswerOutput.safeParse({ ...answer, grounds: [{ kind: 'vibes', ref: 'x' }] })
        .success,
    ).toBe(false);

    expect(
      TicketAnswerOutput.safeParse({
        ...answer,
        decision: 'escalate',
        escalate_reason: 'meh',
      }).success,
    ).toBe(false);
  });

  it('allows 2 to 4 options with at most one recommended, and no others', () => {
    const opt = (i: number, recommended = false) => ({
      id: `o${i}`,
      label: `Option ${i}`,
      recommended,
    });

    const base = { decision: 'escalate', confidence: 0.1, grounds: [] };

    expect(TicketAnswerOutput.safeParse({ ...base, options: [opt(1)] }).success).toBe(
      false,
    );

    expect(
      TicketAnswerOutput.safeParse({ ...base, options: [opt(1, true), opt(2, true)] })
        .success,
    ).toBe(false);

    expect(
      TicketAnswerOutput.safeParse({
        ...base,
        options: [1, 2, 3, 4, 5].map((i) => opt(i)),
      }).success,
    ).toBe(false);
  });

  it('can carry read requests, which the engine answers before the decision counts', () => {
    expect(
      TicketAnswerOutput.safeParse({
        decision: 'escalate',
        confidence: 0,
        grounds: [],
        read_requests: [{ op: 'read', path: 'docs/plan.md' }],
      }).success,
    ).toBe(true);
  });

  it('converts to JSON Schema for the harness', () => {
    expect(() => z.toJSONSchema(TicketAnswerOutput)).not.toThrow();
    expect(() => z.toJSONSchema(TicketRecoverOutput)).not.toThrow();
  });
});

describe('ticket_recover output', () => {
  it('accepts retry with a note and escalate with a diagnosis', () => {
    expect(
      TicketRecoverOutput.safeParse({
        decision: 'retry',
        note: 'Run the migration first.',
        diagnosis: 'The test database was missing.',
        confidence: 0.7,
      }).success,
    ).toBe(true);

    expect(
      TicketRecoverOutput.safeParse({
        decision: 'escalate',
        diagnosis: 'The ticket needs a product decision.',
        confidence: 0.9,
      }).success,
    ).toBe(true);
  });

  it('needs a diagnosis, keeps the note within 1000 characters and the decision within two values', () => {
    expect(
      TicketRecoverOutput.safeParse({ decision: 'retry', confidence: 0.5 }).success,
    ).toBe(false);

    expect(
      TicketRecoverOutput.safeParse({
        decision: 'retry',
        diagnosis: 'd',
        confidence: 0.5,
        note: 'x'.repeat(1001),
      }).success,
    ).toBe(false);

    expect(
      TicketRecoverOutput.safeParse({
        decision: 'cancel',
        diagnosis: 'd',
        confidence: 0.5,
      }).success,
    ).toBe(false);
  });
});

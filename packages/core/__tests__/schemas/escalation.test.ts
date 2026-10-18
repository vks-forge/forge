/**
 * Tests for the escalation schemas.
 *
 * Why: every wait on the owner is one escalation, and its payload is read by the Director's
 *   steps, the server and three screens. A payload that parses loosely would let a question with
 *   two "recommended" options or a failure with no cause reach the owner, and an action body
 *   that parses loosely would let a re-plan with no comment, or an answer with both a choice and
 *   free text, reach the engine. These schemas are the one definition both sides share.
 *
 * Pins: the three payload kinds parse and are told apart by `kind`, options are 0 to 4 with at
 *   most one recommended, the act body is a closed union where answer takes exactly one of
 *   option or text and re-plan and rework need a comment of 5 characters or more.
 * Depends on: src/schemas/escalation, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  EscalationActBody,
  EscalationActReply,
  EscalationAnswer,
  EscalationList,
  EscalationPayload,
  FailureCause,
  SetupCause,
} from '#/schemas/escalation.js';

const question = {
  kind: 'question',
  text: 'Which database?',
  source: 'ask_director',
  options: [
    { id: 'a', label: 'SQLite', recommended: true },
    { id: 'b', label: 'Postgres', recommended: false },
  ],
};

describe('EscalationPayload', () => {
  it('parses each kind', () => {
    const failure = {
      kind: 'failure',
      cause: 'retry_cap',
      summary: 'crash: failed 2 times',
      attempts: [{ at: '2026-10-17T00:00:00.000Z', what: 'run-1', result: 'crash' }],
    };

    const setup = {
      kind: 'setup',
      cause: { type: 'login', harness_id: 'claude-code' },
      summary: 'The harness is signed out.',
      fix_href: '/settings/harnesses/claude-code',
    };

    expect(EscalationPayload.safeParse(question).success).toBe(true);
    expect(EscalationPayload.safeParse(failure).success).toBe(true);
    expect(EscalationPayload.safeParse(setup).success).toBe(true);
  });

  it('rejects a question with two recommended options or more than four', () => {
    const two = question.options.map((o) => ({ ...o, recommended: true }));
    const five = Array.from({ length: 5 }, (_, i) => ({
      id: `o${i}`,
      label: `Option ${i}`,
      recommended: false,
    }));

    expect(EscalationPayload.safeParse({ ...question, options: two }).success).toBe(
      false,
    );

    expect(EscalationPayload.safeParse({ ...question, options: five }).success).toBe(
      false,
    );
  });

  it('rejects a failure with an unknown cause and a setup with an unknown type', () => {
    expect(
      EscalationPayload.safeParse({
        kind: 'failure',
        cause: 'bad_luck',
        summary: 's',
        attempts: [],
      }).success,
    ).toBe(false);

    expect(SetupCause.safeParse({ type: 'wifi' }).success).toBe(false);
  });

  it('lists every failure cause the contract names', () => {
    expect(FailureCause.options).toEqual([
      'lane_hold',
      'rework_cap',
      'retry_cap',
      'rewake_cap',
      'not_retried',
      'max_turns',
      'refused',
      'question_timeout',
      'no_agent_available',
    ]);
  });
});

describe('EscalationAnswer', () => {
  it('needs an action and who acted', () => {
    expect(EscalationAnswer.safeParse({ action: 'answer', by: 'director' }).success).toBe(
      true,
    );

    expect(EscalationAnswer.safeParse({ action: 'answer' }).success).toBe(false);
  });
});

describe('EscalationActBody', () => {
  it('takes exactly one of option_id and text for an answer', () => {
    expect(
      EscalationActBody.safeParse({ action: 'answer', option_id: 'a' }).success,
    ).toBe(true);

    expect(
      EscalationActBody.safeParse({ action: 'answer', text: 'SQLite' }).success,
    ).toBe(true);

    expect(EscalationActBody.safeParse({ action: 'answer' }).success).toBe(false);
    expect(
      EscalationActBody.safeParse({ action: 'answer', option_id: 'a', text: 'x' })
        .success,
    ).toBe(false);
  });

  it('needs a comment of 5 or more characters for replan and rework', () => {
    for (const action of ['replan', 'rework']) {
      expect(EscalationActBody.safeParse({ action }).success).toBe(false);
      expect(EscalationActBody.safeParse({ action, comment: 'no' }).success).toBe(false);
      expect(
        EscalationActBody.safeParse({ action, comment: 'split it up' }).success,
      ).toBe(true);
    }
  });

  it('accepts the bare actions and the optional fields', () => {
    expect(EscalationActBody.safeParse({ action: 'retry' }).success).toBe(true);
    expect(
      EscalationActBody.safeParse({ action: 'retry', note: 'try again' }).success,
    ).toBe(true);

    expect(EscalationActBody.safeParse({ action: 'cancel', cascade: true }).success).toBe(
      true,
    );

    expect(EscalationActBody.safeParse({ action: 'run_as_express' }).success).toBe(true);
    expect(EscalationActBody.safeParse({ action: 'recheck' }).success).toBe(true);
    expect(EscalationActBody.safeParse({ action: 'teleport' }).success).toBe(false);
  });
});

describe('EscalationList and EscalationActReply', () => {
  const view = {
    id: 'int-1',
    ticket_id: 'FG-1',
    ticket_title: 'Add a flag',
    kind: 'question',
    stage: 'owner',
    status: 'pending',
    payload: question,
    actions: ['answer', 'cancel'],
    asked_at: '2026-10-17T00:00:00.000Z',
    escalated_at: '2026-10-17T00:01:00.000Z',
  };

  it('wrap the view the screens read', () => {
    expect(EscalationList.safeParse({ items: [view] }).success).toBe(true);
    expect(EscalationActReply.safeParse({ escalation: view }).success).toBe(true);
    expect(
      EscalationActReply.safeParse({ escalation: { ...view, stage: 'x' } }).success,
    ).toBe(false);
  });
});

describe('decision and sign-off payloads', () => {
  const decision = {
    kind: 'decision',
    cause: 'findings_hold',
    summary: 'Review found blocking findings and holds the merge for you.',
    stage_id: 'reviewer',
    stage_label: 'Review',
    findings: [
      { severity: 'high', issue: 'null case', evidence: 'a.ts:1', file: 'a.ts', line: 1 },
    ],
    rework: { count: 2, cap: 2 },
  };

  const signOff = {
    kind: 'sign_off',
    cause: 'tier_c',
    tier: 'C',
    summary: 'Needs a named person.',
    checks: {
      passed: 4,
      counts: { critical: 0, high: 0, medium: 1, low: 2 },
      overrides: 0,
    },
  };

  it('parses a decision for each cause and a sign-off for each cause', () => {
    for (const cause of ['findings_hold', 'scope_drift']) {
      expect(EscalationPayload.safeParse({ ...decision, cause }).success).toBe(true);
    }

    for (const cause of ['tier_b', 'tier_c', 'owner_stage', 'director_declined']) {
      expect(EscalationPayload.safeParse({ ...signOff, cause }).success).toBe(true);
    }
  });

  it('refuses a decision with an unknown cause, a stage id that is not a slug, or more than 20 findings', () => {
    expect(EscalationPayload.safeParse({ ...decision, cause: 'whim' }).success).toBe(
      false,
    );

    expect(EscalationPayload.safeParse({ ...decision, stage_id: 'Bad Id' }).success).toBe(
      false,
    );

    expect(
      EscalationPayload.safeParse({
        ...decision,
        findings: Array.from({ length: 21 }, () => decision.findings[0]),
      }).success,
    ).toBe(false);
  });

  it('needs five characters of reason for merge anyway and continue, and none for approve and sign off', () => {
    expect(
      EscalationActBody.safeParse({ action: 'merge_anyway', comment: 'four' }).success,
    ).toBe(false);

    expect(
      EscalationActBody.safeParse({ action: 'merge_anyway', comment: '  fives ' })
        .success,
    ).toBe(true);

    expect(
      EscalationActBody.safeParse({ action: 'continue', comment: 'ok' }).success,
    ).toBe(false);

    expect(
      EscalationActBody.safeParse({ action: 'continue', comment: 'carry on' }).success,
    ).toBe(true);

    expect(EscalationActBody.safeParse({ action: 'approve' }).success).toBe(true);
    expect(
      EscalationActBody.safeParse({ action: 'sign_off', signer: 'vikash' }).success,
    ).toBe(true);
  });

  it('stores the comment of an override in the answer', () => {
    expect(
      EscalationAnswer.safeParse({
        action: 'merge_anyway',
        by: 'owner',
        comment: 'accepted',
      }).success,
    ).toBe(true);
  });
});

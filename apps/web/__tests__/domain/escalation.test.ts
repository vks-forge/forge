/**
 * Pins: the escalation schemas read what the server sends and drop what the UI cannot act on; the
 * copy gives every failure cause, setup cause and action a plain sentence; refusals are worded
 * from the server's error code; and the card chat draws the three new event kinds without
 * repeating itself or crashing on a bad payload.
 *
 * Why: one escalation shows in three places and the owner must read the same words in each. A new
 *   cause or action added by the server without a sentence here would reach the owner as an
 *   enum value, and a malformed event must never blank the chat.
 * Depends on: schemas/escalation, domain/escalation-copy, domain/card-chat, domain/card-escalation-lines.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { raisedIds } from '#/domain/card-escalation-lines.js';
import { transcriptOf } from '#/domain/card-chat.js';
import {
  ACTION_LABEL,
  FAILURE_TITLE,
  dependentsOf,
  describeEscalationError,
  escalationTitle,
  replanConsequence,
  settledLine,
} from '#/domain/escalation-copy.js';
import {
  ESCALATION_ACTIONS,
  EscalationActBody,
  EscalationView,
  FAILURE_CAUSES,
} from '#/schemas/escalation.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';
import { failureView, questionView, setupView } from '#tests/helpers/escalation-world.js';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');

const event = (seq: number, kind: string, payload: Record<string, unknown>) =>
  ({
    seq,
    kind,
    at: '2026-10-17T11:00:00.000Z',
    actor: { type: 'director', id: 'x' },
    payload,
  }) as unknown as CardHistoryEvent;

describe('EscalationView schema', () => {
  it('parses a question, a failure and a setup as the server sends them', () => {
    const parsed = [questionView(), failureView('retry_cap'), setupView()].map((raw) =>
      EscalationView.parse(raw),
    );

    expect(parsed.map((view) => view.payload.kind)).toEqual([
      'question',
      'failure',
      'setup',
    ]);
  });

  it('refuses a view that lists an action this UI has no button for, naming the field', () => {
    const result = EscalationView.safeParse(
      failureView('retry_cap', { actions: ['retry', 'teleport', 'cancel'] }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain('actions');
  });

  it('refuses a payload whose failure cause is unknown, so the boundary names the field', () => {
    const raw = failureView('retry_cap');
    (raw['payload'] as Record<string, unknown>)['cause'] = 'gremlins';

    expect(EscalationView.safeParse(raw).success).toBe(false);
  });
});

describe('EscalationActBody', () => {
  it('refuses a re-plan or rework comment under five characters', () => {
    expect(EscalationActBody.safeParse({ action: 'replan', comment: 'no' }).success).toBe(
      false,
    );

    expect(
      EscalationActBody.safeParse({ action: 'rework', comment: '    ' }).success,
    ).toBe(false);

    expect(
      EscalationActBody.safeParse({ action: 'replan', comment: 'split it in two' })
        .success,
    ).toBe(true);
  });

  it('accepts each action in the shape the contract names', () => {
    for (const body of [
      { action: 'answer', option_id: 'o1' },
      { action: 'answer', text: 'UTC' },
      { action: 'retry', note: 'mind the fixture' },
      { action: 'cancel', cascade: true },
      { action: 'run_as_express' },
      { action: 'recheck' },
    ]) {
      expect(EscalationActBody.safeParse(body).success).toBe(true);
    }
  });
});

describe('escalation copy', () => {
  it('has a distinct plain title for every failure cause and never an enum value', () => {
    const titles = FAILURE_CAUSES.map((cause) => FAILURE_TITLE[cause]('standard'));

    expect(new Set(titles).size).toBe(FAILURE_CAUSES.length);
    for (const title of titles) {
      expect(title).not.toMatch(/_/);
    }
  });

  it('says what is held and which lane', () => {
    expect(escalationTitle(EscalationView.parse(failureView('lane_hold')))).toBe(
      'Held: the Standard lane goes live in the next update',
    );
  });

  it('words a held lane without a name, and labels the engine-only lane-live action for history', () => {
    const view = failureView('lane_hold');

    (view['payload'] as Record<string, unknown>)['lane'] = undefined;

    expect(escalationTitle(EscalationView.parse(view))).toBe(
      'Held: the lane goes live in the next update',
    );

    expect(ACTION_LABEL.pipeline_ready).toBe('Lane went live');
  });

  it('titles each setup cause and each question source', () => {
    const tool = setupView();
    (tool['payload'] as Record<string, unknown>)['cause'] = {
      type: 'tool',
      tool: 'git_push',
      harness_kind: 'claude',
      version: '1',
      reason_code: 'not_granted',
    };

    const build = setupView();
    (build['payload'] as Record<string, unknown>)['cause'] = {
      type: 'harness_build',
      harness_kind: 'claude',
      version: '2',
    };

    expect(escalationTitle(EscalationView.parse(setupView()))).toMatch(/sign in/);
    expect(escalationTitle(EscalationView.parse(tool))).toMatch(/git_push/);
    expect(escalationTitle(EscalationView.parse(build))).toMatch(/changed/);
    expect(escalationTitle(EscalationView.parse(questionView()))).toMatch(/question/);
  });

  it('labels every action in the owner words', () => {
    for (const action of ESCALATION_ACTIONS) {
      expect(ACTION_LABEL[action]).toMatch(/^[A-Z]/);
      expect(ACTION_LABEL[action]).not.toMatch(/_/);
    }
  });

  it('says who settled it and when', () => {
    const at = '2026-10-17T11:58:00.000Z';

    expect(settledLine({ action: 'answer', by: 'owner', at }, NOW)).toBe(
      'Answered by you · 2 min ago',
    );

    expect(settledLine({ action: 'answer', by: 'director', at }, NOW)).toBe(
      'Answered by the Director · 2 min ago',
    );

    expect(settledLine({ action: 'recheck', by: 'auto', at }, NOW)).toMatch(/by itself/);
  });

  it('says what re-plan does to the tickets before the owner commits', () => {
    expect(replanConsequence()).toMatch(/not started are replaced/);
  });
});

describe('refusals in words', () => {
  const http = (code: string, extra: Record<string, unknown> = {}) =>
    new ApiError('http', 'server text', {
      status: 409,
      code,
      body: { error: { code, message: 'server text', ...extra } },
    });

  it('explains each code the contract lists and never prints the server message', () => {
    for (const code of [
      'not_pending',
      'action_not_offered',
      'stale',
      'interaction_not_found',
    ]) {
      const text = describeEscalationError(http(code));

      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/server text/);
    }
  });

  it('carries the server detail of a recheck that is still broken', () => {
    expect(
      describeEscalationError(
        http('still_broken', { detail: 'the login is still missing.' }),
      ),
    ).toMatch(/still not fixed: the login is still missing\./);
  });

  it('reads the dependents of a cancel the server refused', () => {
    expect(
      dependentsOf(http('ticket_has_dependents', { dependents: ['SVC-5', 'SVC-6'] })),
    ).toEqual(['SVC-5', 'SVC-6']);

    expect(dependentsOf(http('not_pending'))).toBeNull();
    expect(dependentsOf(new Error('x'))).toBeNull();
  });
});

describe('card chat lines for escalations', () => {
  const raised = event(1, 'escalation', {
    interaction_id: 'int-q1',
    ticket_id: 'SVC-4',
    escalation_kind: 'question',
    title: 'The Worker has a question',
  });

  it('draws a raised escalation as a block for the live card', () => {
    const [line] = transcriptOf([raised], []);

    expect(line?.block).toEqual({
      kind: 'escalation',
      interactionId: 'int-q1',
      ticketId: 'SVC-4',
      title: 'The Worker has a question',
    });
  });

  it('drops a settle whose block is already in the chat, keeps one the owner never saw', () => {
    const settled = (id: string) =>
      event(2, 'escalation_settled', {
        interaction_id: id,
        ticket_id: 'SVC-4',
        action: 'answer',
        by: 'director',
      });

    expect(transcriptOf([raised, settled('int-q1')], [])).toHaveLength(1);

    const alone = transcriptOf([settled('int-other')], []);

    expect(alone).toHaveLength(1);
    expect(alone[0]?.text).toBe('Answered by the Director');
    expect(alone[0]?.ticketId).toBe('SVC-4');
  });

  it('writes the owner comment of a re-plan request into one quiet line', () => {
    const [line] = transcriptOf(
      [
        event(3, 'replan_requested', {
          ticket_id: 'SVC-4',
          comment: 'split the report',
          by: 'owner',
        }),
      ],
      [],
    );

    expect(line?.text).toBe('You asked for a re-plan: split the report');
    expect(line?.tone).toBe('note');
  });

  it('never crashes on a malformed payload', () => {
    const lines = transcriptOf(
      [
        event(1, 'escalation', { nonsense: true }),
        event(2, 'escalation_settled', {}),
        event(3, 'replan_requested', {}),
      ],
      [],
    );

    expect(lines.map((line) => line.text)).toEqual([
      'A ticket needs you',
      'A waiting ticket was settled',
      'You asked for a re-plan',
    ]);
  });

  it('lists the interactions that already have their block', () => {
    expect([...raisedIds([raised])]).toEqual(['int-q1']);
  });
});

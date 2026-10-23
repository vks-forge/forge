/**
 * Pins: a raise of the card is one quiet line in the transcript with its short title (old events
 * fall back to the sentence); a finished step that the very next raise explains is left out;
 * the Director's open question and its answers stay as records; `canAnswerGrill` says when the
 * server would take an answer.
 *
 * Why: the dock holds the decision (d-0172), so the transcript is the history of how the card got
 *   there. It must say each raise once, without repeating "Approve the plan · Waiting for the
 *   owner" right above the dock that says it, and must never offer a second place to decide.
 * Depends on: src/domain/card-chat, src/domain/director-flow. No IO.
 */

import { describe, expect, it } from 'vitest';
import { transcriptOf } from '#/domain/card-chat.js';
import { canAnswerGrill } from '#/domain/director-flow.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';

const ev = (
  seq: number,
  kind: string,
  payload: Record<string, unknown>,
): CardHistoryEvent => ({
  seq,
  kind,
  at: '2026-10-19T10:00:00.000Z',
  actor: { type: 'director', id: 'd' },
  payload,
});

const stepDone = (seq: number, label: string) =>
  ev(seq, 'step_finished', {
    step_id: `s${seq}`,
    step_kind: 'card_approve',
    label,
    summary: 'Waiting for the owner to approve.',
    files_read: [],
  });

describe('transcriptOf records', () => {
  it('draws a raise as one line with its title, or the sentence for an old event', () => {
    const lines = transcriptOf(
      [
        ev(0, 'needs_you', {
          reason: 'The plan needs your approval: a; b.',
          title: 'Plan v1 needs your approval',
          kind: 'plan_approval',
          actions: ['approve_plan'],
        }),
        ev(1, 'needs_you', { reason: 'A ticket is held.', actions: ['answer'] }),
      ],
      [],
    );

    expect(lines.map((line) => line.text)).toEqual([
      'Waiting on you: Plan v1 needs your approval',
      'Waiting on you: A ticket is held.',
    ]);

    expect(lines.every((line) => line.tone === 'note')).toBe(true);
  });

  it('reads an unreadable raise as a neutral line', () => {
    const [line] = transcriptOf([ev(0, 'needs_you', { reason: 5 })], []);

    expect(line?.text).toBe('The card is waiting on you.');
  });

  it('leaves out the step the next raise explains, and keeps other steps', () => {
    const lines = transcriptOf(
      [
        stepDone(0, 'Survey the code'),
        stepDone(1, 'Approve the plan'),
        ev(2, 'needs_you', {
          reason: 'Review the plan.',
          title: 'Plan v1 needs your approval',
          actions: ['approve_plan'],
        }),
      ],
      [],
    );

    expect(lines.map((line) => line.text)).toEqual([
      'Survey the code',
      'Waiting on you: Plan v1 needs your approval',
    ]);
  });

  it('keeps a finished step that no raise follows', () => {
    const lines = transcriptOf(
      [
        stepDone(0, 'Approve the plan'),
        ev(1, 'plan_approved', { version: 1, by: 'owner', ticket_ids: [] }),
      ],
      [],
    );

    expect(lines[0]?.text).toBe('Approve the plan');
  });

  it('keeps the open question as a record that says it is waiting', () => {
    const [, question] = transcriptOf(
      [
        ev(0, 'user_message', { text: 'Go' }),
        ev(1, 'grill_question', {
          question_id: 'q1',
          text: 'Which columns?',
          options: [{ id: 'o1', label: 'All', recommended: true }],
          open_points: 1,
        }),
      ],
      [],
    );

    expect(question?.block).toMatchObject({ kind: 'question', state: 'waiting' });
  });
});

describe('canAnswerGrill', () => {
  it('takes an answer only on an open card that is grilling or verifying', () => {
    expect(canAnswerGrill({ phase: 'grilling' })).toBe(true);
    expect(canAnswerGrill({ phase: 'verifying' })).toBe(true);
    expect(canAnswerGrill({})).toBe(true);
    expect(canAnswerGrill({ phase: 'plan_ready' })).toBe(false);
    expect(canAnswerGrill({ phase: 'grilling', closed_reason: 'Done' })).toBe(false);
  });
});

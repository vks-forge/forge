/**
 * Pins: the open grill question is the newest one with no answer after it and none once the grill
 * is done; a step is pending until one with the same id finishes; a needs_you raise is active only
 * until a later event settles it; unreadable payloads are skipped, never thrown on.
 *
 * Why: the chat offers answer buttons, a thinking row and a pinned banner from these three
 *   answers. A stale question that stays answerable (the server refuses it), a thinking row that
 *   never ends, or a banner that outlives the decision would each leave the owner acting on a
 *   state that is no longer true.
 * Depends on: src/domain/director-flow. No IO.
 */

import { describe, expect, it } from 'vitest';
import { activeNeedsYou, grillOf, pendingStep } from '#/domain/director-flow.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';

const ev = (
  seq: number,
  kind: string,
  payload: Record<string, unknown>,
): CardHistoryEvent => ({
  seq,
  kind,
  at: '2026-10-16T10:00:00.000Z',
  actor: { type: 'director', id: 'd' },
  payload,
});

const question = (id: string, points = 2) =>
  ev(Number(id.slice(1)), 'grill_question', {
    question_id: id,
    text: `Question ${id}`,
    options: [{ id: 'o', label: 'Yes', recommended: true }],
    open_points: points,
  });

describe('grillOf', () => {
  it('opens the newest unanswered question and counts its open points', () => {
    const grill = grillOf([question('q1', 3), question('q2', 1)]);

    expect(grill.question?.question_id).toBe('q2');
    expect(grill.openPoints).toBe(1);
    expect(grill.questions.size).toBe(2);
  });

  it('has none open once the newest is answered or the grill is done', () => {
    const answered = ev(5, 'grill_answer', {
      question_id: 'q1',
      option_id: 'o',
      by: 'owner',
    });

    const done = ev(6, 'grill_done', { reason: 'nothing_open', assumptions: [] });

    expect(grillOf([question('q1'), answered]).question).toBeNull();
    expect(grillOf([question('q1'), done]).question).toBeNull();
    expect(grillOf([question('q1'), answered]).answers.get('q1')?.by).toBe('owner');
  });

  it('skips a payload it cannot read', () => {
    expect(grillOf([ev(0, 'grill_question', { nonsense: 1 })]).question).toBeNull();
  });
});

describe('pendingStep', () => {
  const started = (seq: number, id: string) =>
    ev(seq, 'step_started', { step_id: id, step_kind: 'k', label: `Step ${id}` });

  it('is the newest started step with no matching finish', () => {
    const finished = ev(2, 'step_finished', {
      step_id: 'a',
      step_kind: 'k',
      label: 'Step a',
    });

    expect(pendingStep([started(0, 'a'), started(1, 'b'), finished])?.label).toBe(
      'Step b',
    );

    expect(pendingStep([started(0, 'a'), finished])).toBeNull();
    expect(pendingStep([])).toBeNull();
  });
});

describe('activeNeedsYou', () => {
  const raise = ev(0, 'needs_you', {
    reason: 'Review',
    actions: ['approve_plan', 'dance'],
  });

  it('keeps only the actions this UI can wire', () => {
    expect(activeNeedsYou([raise])?.actions).toEqual(['approve_plan']);
  });

  it('ends when a later event settles it', () => {
    for (const kind of [
      'grill_answer',
      'plan_approved',
      'plan_changes_requested',
      'step_started',
    ]) {
      expect(activeNeedsYou([raise, ev(1, kind, {})])).toBeNull();
    }

    expect(
      activeNeedsYou([raise, ev(1, 'director_message', { text: 'hi' })]),
    ).not.toBeNull();
  });
});

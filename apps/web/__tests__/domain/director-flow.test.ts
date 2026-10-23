/**
 * Pins: the open grill question is the newest one with no answer after it and none once the grill
 * is done; a step is pending until one with the same id finishes; the needs_you event payload
 * keeps the structured kind, title and items and still reads an old event; unreadable payloads
 * are skipped, never thrown on. Which raise is still open is decided by the server now
 * (`needs_you_detail`, pinned in packages/core `needs-you.test.ts`).
 *
 * Why: the dock offers answer buttons and the chat a thinking row from the first two answers. A
 *   stale question that stays answerable (the server refuses it) or a thinking row that never
 *   ends would leave the owner acting on a state that is no longer true.
 * Depends on: src/domain/director-flow, src/schemas/card-events. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  grillOf,
  isThinking,
  lastStepOutcome,
  pendingStep,
} from '#/domain/director-flow.js';
import { NeedsYou } from '#/schemas/card-events.js';
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

describe('NeedsYou event payload', () => {
  const raise = {
    reason: 'Review',
    actions: ['approve_plan', 'dance'],
  };

  it('keeps only the actions this UI can wire', () => {
    expect(NeedsYou.parse(raise).actions).toEqual(['approve_plan']);
  });

  it('reads the structured kind, title and items, and still reads an old event without them', () => {
    const structured = NeedsYou.parse({
      reason: 'The plan needs your approval: a; b.',
      actions: ['approve_plan'],
      kind: 'plan_approval',
      title: 'The plan needs your approval',
      items: ['a', 'b'],
    });

    const old = NeedsYou.parse({ reason: 'Why.', actions: ['answer'] });

    expect(structured).toMatchObject({
      kind: 'plan_approval',
      title: 'The plan needs your approval',
      items: ['a', 'b'],
    });

    expect(old).toMatchObject({ reason: 'Why.' });
    expect(old.kind).toBeUndefined();
  });

  it('reads a kind this UI does not know as absent instead of dropping the raise', () => {
    const future = NeedsYou.parse({ reason: 'Why.', actions: [], kind: 'gossip' });

    expect(future).toMatchObject({ reason: 'Why.' });
    expect(future.kind).toBeUndefined();
  });
});

describe('step outcomes and "thinking"', () => {
  const step = (
    seq: number,
    id: string,
    kind: 'step_started' | 'step_finished',
    extra = {},
  ) => ev(seq, kind, { step_id: id, step_kind: 'k', label: `Step ${id}`, ...extra });

  it('reads how the newest finished step ended, and says nothing while one is running', () => {
    expect(
      lastStepOutcome([
        step(0, 'a', 'step_started'),
        step(1, 'a', 'step_finished', { outcome: 'paused_for_you' }),
      ]),
    ).toBe('paused_for_you');

    expect(
      lastStepOutcome([step(0, 'a', 'step_started'), step(1, 'a', 'step_finished')]),
    ).toBe('finished');

    expect(
      lastStepOutcome([
        step(1, 'a', 'step_finished', { outcome: 'failed' }),
        step(2, 'b', 'step_started'),
      ]),
    ).toBeNull();
  });

  it('a step that paused for the owner or failed is finished, never pending', () => {
    for (const outcome of ['paused_for_you', 'failed']) {
      expect(
        pendingStep([
          step(0, 'a', 'step_started'),
          step(1, 'a', 'step_finished', { outcome }),
        ]),
      ).toBeNull();
    }
  });

  it('trusts the server first and never shows a wait for an unfinished step while the owner is asked', () => {
    expect(
      isThinking({ serverState: 'thinking', stepRunning: false, waitingOnOwner: true }),
    ).toBe(true);

    expect(
      isThinking({ serverState: 'idle', stepRunning: true, waitingOnOwner: true }),
    ).toBe(false);

    expect(
      isThinking({ serverState: 'idle', stepRunning: true, waitingOnOwner: false }),
    ).toBe(true);

    expect(
      isThinking({ serverState: 'idle', stepRunning: false, waitingOnOwner: false }),
    ).toBe(false);
  });
});

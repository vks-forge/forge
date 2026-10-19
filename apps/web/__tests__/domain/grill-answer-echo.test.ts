/**
 * Pins: a typed answer that the history records as a `user_message` and a `grill_answer` with the
 * same words becomes one owner line; an option pick shows the option's label; a question reads
 * "waiting" only while it can be answered and "answered" only when an answer exists.
 *
 * Why: the engine stores a typed answer twice (the chat message the reply queue points at, then
 *   the answer to the question). Drawn as stored, the owner sees their own sentence twice, and a
 *   question that still needs them reads like a finished one. Existing cards already hold these
 *   pairs, so the view must repair them rather than rely on the writer.
 * Depends on: src/domain/grill-answer-echo, card-chat, card-event-lines. No IO.
 */

import { describe, expect, it } from 'vitest';
import { transcriptOf } from '#/domain/card-chat.js';
import { questionState } from '#/domain/card-event-lines.js';
import { echoedAnswerSeqs } from '#/domain/grill-answer-echo.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';

const ev = (
  seq: number,
  kind: string,
  payload: Record<string, unknown>,
): CardHistoryEvent => ({
  seq,
  kind,
  at: '2026-10-19T10:00:00.000Z',
  actor: {
    type: kind === 'user_message' || kind === 'grill_answer' ? 'user' : 'director',
    id: 'x',
  },
  payload,
});

const question = (seq: number, id: string) =>
  ev(seq, 'grill_question', {
    question_id: id,
    text: `Question ${id}`,
    options: [
      { id: 'o1', label: 'Pay for it', recommended: true },
      { id: 'o2', label: 'Stay free', recommended: false },
    ],
    allow_other: true,
    open_points: 2,
  });

const typed = (seq: number, id: string, text: string) => [
  ev(seq, 'user_message', { text }),
  ev(seq + 1, 'grill_answer', { question_id: id, text, by: 'owner' }),
];

describe('echoedAnswerSeqs', () => {
  it('marks the answer that repeats the message right before it', () => {
    const events = [
      question(1, 'q7'),
      ...typed(2, 'q7', 'we will pay for whatevr needed'),
    ];

    expect([...echoedAnswerSeqs(events)]).toEqual([3]);
  });

  it('does not mark an option pick, which has no message', () => {
    const events = [
      question(1, 'q6'),
      ev(2, 'grill_answer', { question_id: 'q6', option_id: 'o1', by: 'owner' }),
    ];

    expect(echoedAnswerSeqs(events).size).toBe(0);
  });

  it('does not pair an answer with an older message or different words', () => {
    const events = [
      ev(1, 'user_message', { text: 'something else' }),
      question(2, 'q1'),
      ev(3, 'grill_answer', { question_id: 'q1', text: 'something else', by: 'owner' }),
      ev(4, 'user_message', { text: 'hello' }),
      question(5, 'q2'),
      ev(6, 'grill_answer', { question_id: 'q2', text: 'hello', by: 'owner' }),
    ];

    expect(echoedAnswerSeqs(events).size).toBe(0);
  });

  it('pairs each answer once, so two identical answers in a row stay two', () => {
    const events = [
      question(1, 'q1'),
      ...typed(2, 'q1', 'yes'),
      question(4, 'q2'),
      ev(5, 'grill_answer', { question_id: 'q2', text: 'yes', by: 'owner' }),
    ];

    expect([...echoedAnswerSeqs(events)]).toEqual([3]);
  });
});

describe('transcriptOf with a typed answer', () => {
  const events = [
    question(1, 'q7'),
    ...typed(2, 'q7', 'we will pay for whatevr needed'),
    question(4, 'q8'),
  ];

  it('draws one owner bubble for the answer', () => {
    const lines = transcriptOf(events, []);
    const mine = lines.filter((l) => l.tone === 'you');

    expect(mine.map((l) => l.text)).toEqual(['we will pay for whatevr needed']);
  });

  it('shows the label of a picked option as the owner bubble', () => {
    const lines = transcriptOf(
      [
        question(1, 'q6'),
        ev(2, 'grill_answer', { question_id: 'q6', option_id: 'o1', by: 'owner' }),
      ],
      [],
    );

    expect(lines.filter((l) => l.tone === 'you').map((l) => l.text)).toEqual([
      'Pay for it',
    ]);
  });

  it('labels the open question waiting and the answered one answered', () => {
    const states = transcriptOf(events, []).flatMap((l) =>
      l.block?.kind === 'question' ? [l.block.state] : [],
    );

    expect(states).toEqual(['answered', 'waiting']);
  });
});

describe('questionState', () => {
  it.each([
    [true, true, 'answered'],
    [true, false, 'answered'],
    [false, true, 'waiting'],
    [false, false, 'unanswered'],
  ] as const)('answer %s, actionable %s reads %s', (hasAnswer, actionable, expected) => {
    expect(questionState(hasAnswer, actionable)).toBe(expected);
  });
});

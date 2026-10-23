/**
 * Pins: an answered grill question collapses to its chosen words and the owner's answer is one
 * bubble (a typed answer is not drawn twice); the open question reads "Waiting for your answer"
 * and the answered one "Answered"; an answer the Director gave from its own recommendation is
 * labelled; no needs-you dock is drawn once nothing waits.
 *
 * Why: the engine stores a typed answer twice, and the chat is the history of the grill now that
 *   the dock holds the open question. Drawn as stored the owner would read their own sentence
 *   twice, and a question that still needs them would look like a finished one.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   components/card/question-record, domain/grill-answer-echo.
 */

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { flowEvent, flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
import { NO_NEEDS_YOU } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;

const QUESTION = {
  question_id: 'q1',
  text: 'How many times should a failed send retry?',
  why: 'It sets how long a target can be down before we give up.',
  options: [
    { id: 'o1', label: 'Three times', recommended: true },
    { id: 'o2', label: 'Five times', recommended: false },
  ],
  allow_other: true,
  open_points: 3,
};

const grilling = [
  flowEvent(0, 'user_message', { text: 'Retry failed webhooks' }),
  flowEvent(1, 'grill_question', QUESTION),
];

describe('Card chat: grill history', () => {
  it('collapses an answered question to the chosen words and shows the owner bubble', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          ...grilling,
          flowEvent(2, 'grill_answer', {
            question_id: 'q1',
            option_id: 'o1',
            by: 'owner',
          }),
        ],
      }),
    });

    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText('Three times')).toBeInTheDocument();
    expect(within(log).getByText(QUESTION.text)).toBeInTheDocument();
    expect(
      within(log).queryByRole('button', { name: /Five times/ }),
    ).not.toBeInTheDocument();

    expect(
      within(log).queryByRole('button', { name: 'Enough, write the plan' }),
    ).toBeNull();

    expect(screen.queryByRole('button', NO_NEEDS_YOU)).toBeNull();
  });

  it('draws a typed answer once, labels the open question waiting and the answered one answered', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          ...grilling,
          flowEvent(2, 'user_message', { text: 'Retry until it works' }),
          flowEvent(3, 'grill_answer', {
            question_id: 'q1',
            text: 'Retry until it works',
            by: 'owner',
          }),
          flowEvent(4, 'grill_question', {
            ...QUESTION,
            question_id: 'q2',
            text: 'Should failures page someone?',
          }),
        ],
      }),
    });

    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText('Should failures page someone?')).toBeVisible();
    expect(within(log).getAllByText('Retry until it works')).toHaveLength(1);
    expect(within(log).getByText('Answered')).toBeInTheDocument();
    expect(within(log).getByText('Waiting for your answer')).toBeInTheDocument();
    expect(within(log).queryByText('Not answered')).toBeNull();
    expect(
      screen.getByPlaceholderText(/Type your answer to the open question/),
    ).toBeInTheDocument();
  });

  it('shows the picked option label as the owner bubble', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          ...grilling,
          flowEvent(2, 'grill_answer', {
            question_id: 'q1',
            option_id: 'o2',
            by: 'owner',
          }),
        ],
      }),
    });

    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText('Five times')).toBeInTheDocument();
    expect(within(log).getAllByText('You').length).toBeGreaterThanOrEqual(2);
  });

  it('labels an answer the Director gave from its own recommendation', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          ...grilling,
          flowEvent(2, 'grill_answer', {
            question_id: 'q1',
            option_id: 'o1',
            by: 'recommendation',
          }),
        ],
      }),
    });

    expect(await screen.findByText('Recommendation used')).toBeInTheDocument();
  });
});

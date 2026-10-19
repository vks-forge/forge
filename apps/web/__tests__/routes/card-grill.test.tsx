/**
 * Pins: the card chat draws a grill question (text, why, options, a Recommended badge, "Other",
 * two shortcuts and the open-point count), posts the chosen option, free text and both
 * shortcuts, collapses answered questions to the chosen words, labels an answer the Director
 * gave from its own recommendation, lets only the newest open question be answered and says in
 * words when the question is no longer open.
 *
 * Why: the grill is how the owner steers every card. A question whose buttons post nothing, or
 *   an old question that can still be answered (the server would refuse it), stops the owner
 *   from moving a card forward.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   components/card/question-block.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { flowEvent, flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
import { refusal } from '#tests/helpers/fetch-stub.js';
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

describe('Card chat: grill question', () => {
  it('shows the question, why, options, the Recommended badge, shortcuts and open points', async () => {
    renderApp({ path: PAGE, routes: flowRoutes({ events: grilling }) });
    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText(QUESTION.text)).toBeInTheDocument();
    expect(within(log).getByText(QUESTION.why)).toBeInTheDocument();
    expect(within(log).getByRole('button', { name: /Three times/ })).toBeInTheDocument();
    expect(within(log).getByRole('button', { name: /Five times/ })).toBeInTheDocument();
    expect(within(log).getByText('Recommended')).toBeInTheDocument();
    expect(within(log).getByText('3 open points')).toBeInTheDocument();
    expect(
      within(log).getByRole('button', { name: 'Use your recommendations for the rest' }),
    ).toBeInTheDocument();

    expect(
      within(log).getByRole('button', { name: 'Enough, write the plan' }),
    ).toBeInTheDocument();

    expect(within(log).getByRole('button', { name: 'Other…' })).toBeInTheDocument();
  });

  it('posts the chosen option', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PAGE, routes: flowRoutes({ events: grilling }) });

    await user.click(await screen.findByRole('button', { name: /Five times/ }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/grill/answer')[0]?.body).toEqual({
        question_id: 'q1',
        option_id: 'o2',
      }),
    );
  });

  it('posts a free-text answer from Other', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PAGE, routes: flowRoutes({ events: grilling }) });

    await user.click(await screen.findByRole('button', { name: 'Other…' }));
    await user.type(
      screen.getByLabelText('Your answer'),
      'Retry until the target answers',
    );

    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/grill/answer')[0]?.body).toEqual({
        question_id: 'q1',
        text: 'Retry until the target answers',
      }),
    );
  });

  it('posts both shortcuts', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PAGE, routes: flowRoutes({ events: grilling }) });

    await user.click(
      await screen.findByRole('button', {
        name: 'Use your recommendations for the rest',
      }),
    );

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/grill/shortcut')[0]?.body).toEqual({
        kind: 'use_recommendations',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Enough, write the plan' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/grill/shortcut')[1]?.body).toEqual({
        kind: 'write_plan_now',
      }),
    );
  });

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

  it('lets only the newest open question be answered', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          ...grilling,
          flowEvent(2, 'grill_question', {
            ...QUESTION,
            question_id: 'q2',
            text: 'Should failures page someone?',
            options: [
              { id: 'p1', label: 'Yes, page', recommended: false },
              { id: 'p2', label: 'No, log only', recommended: true },
            ],
            open_points: 2,
          }),
        ],
      }),
    });

    expect(
      await screen.findByRole('button', { name: /No, log only/ }),
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Three times/ })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Enough, write the plan' }),
    ).toHaveLength(1);
  });

  it('says in words when the question is no longer open', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: grilling,
        answers: { grill_answer: refusal(409, 'question_not_open', 'closed') },
      }),
    });

    await user.click(await screen.findByRole('button', { name: /Three times/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer open/i);
  });
});

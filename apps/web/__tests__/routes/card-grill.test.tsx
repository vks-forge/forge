/**
 * Pins: the open grill question lives in the needs-you dock (text, why on demand, options, a
 * Recommended badge, a one-tap "Use recommended" button, two shortcuts and the open-point count) and the chat keeps a one-line
 * record of it; the dock posts the chosen option and both shortcuts, a typed message in the
 * normal box is the free-text answer (there is no second "Other" box), answered questions
 * collapse to the chosen words, an answer the Director gave from its own recommendation is
 * labelled, only the newest open question is answerable and a refusal is said in words.
 *
 * Why: the grill is how the owner steers every card. A question whose buttons post nothing, an
 *   old question that can still be answered (the server would refuse it), or two free-text
 *   boxes for one answer stop the owner from moving a card forward.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   routes/card/dock-question, components/work/needs-you-dock, components/card/question-record.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  dockItem,
  flowEvent,
  flowRoutes,
  FLOW_CARD,
} from '#tests/helpers/flow-fixtures.js';
import type { FlowRoutesOptions } from '#tests/helpers/flow-fixtures.js';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
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

/** A grilling card whose open question waits in the dock, as the server reports it. */
const asking = (
  events: ReturnType<typeof flowEvent>[] = grilling,
  answers: FlowRoutesOptions['answers'] = {},
) =>
  flowRoutes({
    events,
    answers,
    detail: {
      needs_you: true,
      needs_you_detail: [
        dockItem('director_questions', ['answer'], {
          title: 'The Director has a question',
          items: [QUESTION.text],
        }),
      ],
    },
  });

describe('Card chat: grill question', () => {
  it('shows the question, why on demand, options, the Recommended badge, shortcuts and open points in the dock', async () => {
    const user = userEvent.setup();
    renderApp({ path: PAGE, routes: asking() });
    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    expect(await within(dock).findByText(QUESTION.text)).toBeInTheDocument();
    expect(within(dock).queryByText(QUESTION.why)).not.toBeInTheDocument();

    await user.click(within(dock).getByRole('button', { name: /Why it matters/ }));

    expect(within(dock).getByText(QUESTION.why)).toBeInTheDocument();
    expect(
      within(dock).getByRole('button', { name: /^Three times/ }),
    ).toBeInTheDocument();

    expect(within(dock).getByRole('button', { name: /^Five times/ })).toBeInTheDocument();
    expect(within(dock).getByText('Recommended')).toBeInTheDocument();
    expect(within(dock).getByText(/3 open points/)).toBeInTheDocument();
    expect(
      within(dock).getByRole('button', { name: 'Use your recommendations for the rest' }),
    ).toBeInTheDocument();

    expect(
      within(dock).getByRole('button', { name: 'Enough, write the plan' }),
    ).toBeInTheDocument();

    // No second free-text box: the message box answers.
    expect(screen.queryByRole('button', { name: 'Other…' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
  });

  it('offers one tap on the recommended answer and keeps the other options', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PAGE, routes: asking() });
    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    const primary = await within(dock).findByRole('button', {
      name: 'Use recommended: Three times',
    });

    expect(primary).toBeVisible();
    expect(within(dock).getByRole('button', { name: /^Five times/ })).toBeVisible();

    await user.click(primary);

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/grill/answer')[0]?.body).toEqual({
        question_id: 'q1',
        option_id: 'o1',
      }),
    );
  });

  it('draws no one-tap button when the Director recommends nothing, and digits still answer', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PAGE,
      routes: asking([
        flowEvent(0, 'user_message', { text: 'Retry failed webhooks' }),
        flowEvent(1, 'grill_question', {
          ...QUESTION,
          options: QUESTION.options.map((option) => ({ ...option, recommended: false })),
        }),
      ]),
    });

    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    await within(dock).findByRole('button', { name: /^Five times/ });

    expect(within(dock).queryByRole('button', { name: /Use recommended/ })).toBeNull();

    dock.focus();
    await user.keyboard('1');

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/grill/answer')[0]?.body).toEqual({
        question_id: 'q1',
        option_id: 'o1',
      }),
    );
  });

  it('keeps only a record of the question in the chat, with no buttons', async () => {
    renderApp({ path: PAGE, routes: asking() });
    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText(QUESTION.text)).toBeInTheDocument();
    expect(within(log).getByText('Waiting for your answer')).toBeInTheDocument();
    expect(within(log).queryByRole('button', { name: /Three times/ })).toBeNull();
    expect(
      within(log).queryByRole('button', { name: 'Enough, write the plan' }),
    ).toBeNull();
  });

  it('posts the chosen option', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PAGE, routes: asking() });
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: /^Five times/ }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/grill/answer')[0]?.body).toEqual({
        question_id: 'q1',
        option_id: 'o2',
      }),
    );
  });

  it('answers with a number key while the dock has focus', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PAGE, routes: asking() });
    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    await within(dock).findByRole('button', { name: /^Five times/ });
    dock.focus();
    await user.keyboard('2');

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/grill/answer')[0]?.body).toEqual({
        question_id: 'q1',
        option_id: 'o2',
      }),
    );
  });

  it('answers from the message box: a typed message is the free-text answer', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PAGE, routes: asking() });

    const box = await screen.findByPlaceholderText(
      /Type your answer to the open question/,
    );

    await user.type(box, 'Retry until the target answers');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/messages')[0]?.body).toMatchObject({
        text: 'Retry until the target answers',
      }),
    );

    expect(forge.stub.callsTo('POST /cards/:id/grill/answer')).toHaveLength(0);
  });

  it('posts both shortcuts', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PAGE, routes: asking() });
    await openNeedsYou(userEvent.setup());

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

  it('lets only the newest open question be answered', async () => {
    renderApp({
      path: PAGE,
      routes: asking([
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
      ]),
    });

    await openNeedsYou(userEvent.setup());

    expect(
      await screen.findByRole('button', { name: /^No, log only/ }),
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
      routes: asking(grilling, {
        grill_answer: refusal(409, 'question_not_open', 'closed'),
      }),
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: /^Three times/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer open/i);
  });
});

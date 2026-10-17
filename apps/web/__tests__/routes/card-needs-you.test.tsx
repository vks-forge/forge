/**
 * Pins: the pinned Needs you banner states the Director's reason and shows one button per
 * action it listed, each wired to a real call or view (start planning, the plan dialogs, focus
 * on the open question, run as Express or a way to choose the ticket), and goes away once a
 * later event settled it.
 *
 * Why: a card waiting on the owner with a dead button or only reason text is a bug (d-0135):
 *   the owner could not move the card forward from the one place that says it is stuck.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   routes/card/needs-you-banner, routes/card/use-banner-actions.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  flowDetail,
  flowEvent,
  flowRoutes,
  FLOW_CARD,
} from '#tests/helpers/flow-fixtures.js';

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

describe('Card page: Needs you banner', () => {
  const raised = (
    reason: string,
    actions: string[],
    extra: Record<string, unknown> = {},
  ) =>
    flowRoutes({
      detail: { needs_you: true, column: 'needs_you' },
      events: [flowEvent(0, 'needs_you', { reason, actions, ...extra })],
    });

  it('pins the reason and a button for every listed action', async () => {
    renderApp({
      path: PAGE,
      routes: raised('A plan is waiting for you.', ['approve_plan', 'request_changes']),
    });

    const banner = await screen.findByRole('region', { name: 'Needs you' });

    expect(within(banner).getByText('A plan is waiting for you.')).toBeInTheDocument();
    expect(
      within(banner).getByRole('button', { name: 'Review and approve' }),
    ).toBeInTheDocument();

    expect(
      within(banner).getByRole('button', { name: 'Request changes' }),
    ).toBeInTheDocument();

    expect(within(banner).getAllByRole('button')).toHaveLength(2);
  });

  it('wires start_planning to its endpoint', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PAGE,
      routes: raised('This card has not been planned yet.', ['start_planning']),
    });

    await user.click(await screen.findByRole('button', { name: 'Start planning' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/start-planning')).toHaveLength(1),
    );
  });

  it('wires approve_plan and request_changes to the Plan tab dialogs', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PAGE,
      routes: {
        ...raised('Review the plan.', ['approve_plan', 'request_changes']),
        ...flowRoutes({
          detail: { needs_you: true, phase: 'plan_ready' },
          events: [
            flowEvent(0, 'needs_you', {
              reason: 'Review the plan.',
              actions: ['approve_plan', 'request_changes'],
            }),
          ],
          plan: {
            versions: [{ version: 1, created_at: new Date().toISOString() }],
            current: planFor(1),
          },
        }),
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Review and approve' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Approve plan v1/);
  });

  it('wires answer to the open question', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        detail: { needs_you: true },
        events: [
          ...grilling,
          flowEvent(2, 'needs_you', {
            reason: 'The Director needs an answer.',
            actions: ['answer'],
          }),
        ],
      }),
    });

    await user.click(await screen.findByRole('button', { name: 'Answer the question' }));

    expect(screen.getByRole('button', { name: /Three times/ })).toHaveFocus();
  });

  it('wires run_as_express to the held ticket named in the raise', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PAGE,
      routes: raised('A ticket is held.', ['run_as_express'], { ticket_id: 'SVC-9' }),
    });

    await user.click(await screen.findByRole('button', { name: 'Run as Express' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /tickets/:id/run-as-express')[0]?.path).toBe(
        '/tickets/SVC-9/run-as-express',
      ),
    );
  });

  it('leaves no dead end when run_as_express names no ticket: it opens the Tickets tab', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({
      path: PAGE,
      routes: raised('A ticket is held.', ['run_as_express']),
    });

    await user.click(await screen.findByRole('button', { name: 'Choose a ticket' }));

    expect(router.state.location.search).toBe('?tab=tickets');
  });

  it('offers a Settings link and a Retry button when a step ran out of budget', async () => {
    const user = userEvent.setup();
    const { forge, router } = renderApp({
      path: PAGE,
      routes: raised(
        'The Director per-step budget ($0.50) is too small for "Survey the code".',
        ['raise_step_budget', 'retry_step'],
      ),
    });

    const banner = await screen.findByRole('region', { name: 'Needs you' });
    const link = within(banner).getByRole('link', { name: 'Raise the step budget' });

    expect(link).toHaveAttribute('href', '/settings/limits');

    await user.click(within(banner).getByRole('button', { name: 'Retry the step' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/planning/retry')).toHaveLength(1),
    );

    expect(router.state.location.pathname).toBe(PAGE);
  });

  it('goes away once a later event settled it', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        detail: flowDetail({ needs_you: false }),
        events: [
          flowEvent(0, 'needs_you', {
            reason: 'Review the plan.',
            actions: ['approve_plan'],
          }),
          flowEvent(1, 'plan_approved', { version: 1, by: 'owner', ticket_ids: [] }),
        ],
      }),
    });

    await screen.findByText(/approved by you/);

    expect(screen.queryByRole('region', { name: 'Needs you' })).not.toBeInTheDocument();
  });
});

function planFor(version: number): Record<string, unknown> {
  return {
    card_id: FLOW_CARD,
    version,
    created_at: new Date().toISOString(),
    author: 'director',
    goal: 'Goal',
    tickets: [
      {
        key: 't1',
        title: 'One',
        priority: 'normal',
        depends_on: [],
        lane: 'express',
        size: 'S',
      },
    ],
  };
}

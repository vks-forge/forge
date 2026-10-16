/**
 * Pins: a running Director step shows as "thinking" with its label and ends when the step
 * finishes (the files it read expand on demand); a ready plan is a card with a Review plan
 * button that opens the Plan tab; approvals, requested changes, the end of the grill and budget
 * warnings are system lines; a malformed payload or an unknown kind is a neutral line, never a
 * crash.
 *
 * Why: the owner follows the Director's work in the chat. A thinking row that never ends, a plan
 *   announcement with no way to open it, or a chat that goes blank on a payload from a newer
 *   Director would each leave the owner not knowing what is happening.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   domain/card-event-lines, components/card/*.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { flowEvent, flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';

import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;

describe('Card chat: Director activity and system lines', () => {
  it('shows thinking with the step label while a step has started and not finished', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          flowEvent(0, 'user_message', { text: 'Go' }),
          flowEvent(1, 'step_started', {
            step_id: 's1',
            step_kind: 'card_survey',
            label: 'Reading the project',
          }),
        ],
      }),
    });

    expect(await screen.findByText(/The Director is thinking/)).toBeInTheDocument();
    expect(screen.getByText('Reading the project')).toBeInTheDocument();
  });

  it('stops thinking once the step finished and lists the files it read on demand', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          flowEvent(0, 'step_started', {
            step_id: 's1',
            step_kind: 'k',
            label: 'Survey',
          }),
          flowEvent(1, 'step_finished', {
            step_id: 's1',
            step_kind: 'k',
            label: 'Survey',
            files_read: [
              { path: 'src/a.ts', bytes: 10 },
              { path: 'src/b.ts', bytes: 20 },
            ],
            config_version: 0,
            summary: 'Read 2 files',
          }),
        ],
      }),
    });

    const toggle = await screen.findByRole('button', { name: /Read 2 files/ });

    expect(screen.queryByText(/The Director is thinking/)).not.toBeInTheDocument();
    expect(screen.queryByText('src/a.ts')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('src/b.ts')).toBeInTheDocument();
  });

  it('draws a ready plan as a card with a Review plan button that opens the Plan tab', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({
      path: PAGE,
      routes: flowRoutes({
        detail: { phase: 'plan_ready', column: 'needs_you', needs_you: true },
        events: [
          flowEvent(0, 'plan_ready', {
            version: 2,
            ticket_count: 3,
            auto_approve_eligible: false,
          }),
        ],
      }),
    });

    expect(await screen.findByText('Plan v2 is ready.')).toBeInTheDocument();
    expect(screen.getByText('3 tickets')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review plan' }));

    expect(router.state.location.search).toBe('?tab=plan');
  });

  it('draws approvals, requested changes, the end of the grill and budget warnings as system lines', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          flowEvent(0, 'grill_done', {
            reason: 'use_recommendations',
            assumptions: ['A', 'B'],
          }),
          flowEvent(1, 'plan_changes_requested', {
            version: 1,
            comment: 'Split the docs ticket',
          }),
          flowEvent(2, 'plan_approved', {
            version: 2,
            by: 'owner',
            ticket_ids: ['T-1', 'T-2'],
          }),
          flowEvent(3, 'budget_warning', { threshold: 0.8, spent_usd: 4, cap_usd: 5 }),
        ],
      }),
    });

    expect(
      await screen.findByText(/Using the recommendations for the rest/),
    ).toBeInTheDocument();

    expect(screen.getByText(/2 assumptions noted/)).toBeInTheDocument();
    expect(
      screen.getByText(/Changes requested on plan v1: Split the docs ticket/),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Plan v2 approved by you: 2 tickets created/),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/\$4\.00 of \$5\.00 spent \(80% of the cap\)/),
    ).toBeInTheDocument();
  });

  it('shows a neutral line for a malformed payload and an unknown kind', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          flowEvent(0, 'grill_question', { nonsense: true }),
          flowEvent(1, 'plan_ready', { version: 'two' }),
          flowEvent(2, 'something_from_the_future', {}),
        ],
      }),
    });

    expect(
      await screen.findByText(/asked a question I could not read/),
    ).toBeInTheDocument();

    expect(screen.getByText('A plan is ready.')).toBeInTheDocument();
    expect(screen.getByText('Event: something from the future')).toBeInTheDocument();
  });
});

/**
 * Pins: the needs-you dock states the waiting item's short title and offers at most one primary
 * and one secondary action in the owner's words, each wired to a real call or view (start
 * planning, the plan dialogs, run as Express, retry the step, a link to the step-budget
 * setting); a plan's reasons show as chips with the full list on demand; the dock leaves when
 * the server no longer lists the item, and a failed action is explained inside the item.
 *
 * Why: a card waiting on the owner with a dead button or only reason text is a bug (d-0135): the
 *   owner could not move the card forward from the one place that says it is stuck. The dock is
 *   the only such place now, and it reads what the server lists (`needs_you_detail`), so these
 *   tests drive it from that field.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   components/work/needs-you-dock, routes/card/use-card-dock.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import {
  dockItem,
  flowEvent,
  flowRoutes,
  FLOW_CARD,
  planFixture,
} from '#tests/helpers/flow-fixtures.js';
import type { FlowRoutesOptions } from '#tests/helpers/flow-fixtures.js';
import { NO_NEEDS_YOU, openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;

const raised = (
  kind: string,
  actions: string[],
  extra: Record<string, unknown> = {},
  more: Partial<FlowRoutesOptions> = {},
) =>
  flowRoutes({
    detail: {
      needs_you: true,
      column: 'needs_you',
      needs_you_detail: [dockItem(kind, actions, extra)],
    },
    events: [flowEvent(0, 'needs_you', { reason: 'Why.', actions })],
    ...more,
  });

describe('Card page: needs-you dock', () => {
  it('states the title and offers a primary and a secondary action, nothing more', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PAGE,
      routes: raised(
        'plan_approval',
        ['approve_plan', 'request_changes'],
        { title: 'Plan v1 needs your approval' },
        { plan: { versions: [], current: planFixture() } },
      ),
    });

    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    expect(within(dock).getByText('Plan v1 needs your approval')).toBeInTheDocument();
    expect(
      within(dock).getByRole('button', { name: 'Approve plan…' }),
    ).toBeInTheDocument();

    expect(
      within(dock).getByRole('button', { name: 'Request changes' }),
    ).toBeInTheDocument();

    // No stepper for one item.
    expect(within(dock).queryByRole('button', { name: /Next waiting item/ })).toBeNull();
  });

  it('shows the plan reasons as chips and the full list under Reasons', async () => {
    const user = userEvent.setup();
    const reasons = [
      'Tier C path: packages/core/src/domain/state-machine.ts',
      'Unverified claim: Redis 8 supports this',
      'Overlaps FX-C1',
      'Changed since the last version',
    ];

    renderApp({
      path: PAGE,
      routes: raised(
        'plan_approval',
        ['approve_plan', 'request_changes'],
        { title: 'Plan v1 needs your approval', items: reasons },
        { plan: { versions: [], current: planFixture() } },
      ),
    });

    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    expect(within(dock).getByText('Overlaps FX-C1')).toBeInTheDocument();
    expect(within(dock).getByText('+1 more')).toBeInTheDocument();
    expect(within(dock).queryByRole('list', { name: 'Reasons' })).toBeNull();

    await user.click(within(dock).getByRole('button', { name: /Reasons/ }));
    const list = within(dock).getByRole('list', { name: 'Reasons' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getByText(reasons[0] ?? '')).toBeInTheDocument();
  });

  it('opens the approve confirm from the dock and posts the approval', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PAGE,
      routes: raised(
        'plan_approval',
        ['approve_plan', 'request_changes'],
        { title: 'Plan v1 needs your approval' },
        { plan: { versions: [], current: planFixture() } },
      ),
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Approve plan…' }));
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent(/Approve plan v1/);
    expect(forge.stub.callsTo('POST /cards/:id/plan/approve')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Approve plan' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/plan/approve')).toHaveLength(1),
    );
  });

  it('opens the request-changes dialog from the dock', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PAGE,
      routes: raised(
        'plan_approval',
        ['approve_plan', 'request_changes'],
        {},
        { plan: { versions: [], current: planFixture() } },
      ),
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Request changes' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(/Request changes/);
  });

  it('wires start_planning to its endpoint', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PAGE,
      routes: raised('start_planning', ['start_planning'], {
        title: 'Start planning this card',
      }),
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Start planning' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/start-planning')).toHaveLength(1),
    );
  });

  it('wires run_as_express to the held ticket the raise names', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PAGE,
      routes: raised('held_ticket', ['run_as_express'], { ticket_id: 'SVC-9' }),
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Run as Express' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /tickets/:id/run-as-express')[0]?.path).toBe(
        '/tickets/SVC-9/run-as-express',
      ),
    );
  });

  it('offers a Settings link and a Retry button when a step ran out of budget', async () => {
    const user = userEvent.setup();
    const { forge, router } = renderApp({
      path: PAGE,
      routes: raised('step_budget', ['raise_step_budget', 'retry_step'], {
        title: 'The Director ran out of step budget',
        items: ['The per-step budget ($0.50) is too small for "Survey the code".'],
      }),
    });

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    const link = within(dock).getByRole('link', { name: 'Raise the step budget' });

    expect(link).toHaveAttribute('href', '/settings/limits');

    await user.click(within(dock).getByRole('button', { name: 'Retry the step' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/planning/retry')).toHaveLength(1),
    );

    expect(router.state.location.pathname).toBe(PAGE);
  });

  it('says in words, inside the item, why an action failed', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PAGE,
      routes: raised(
        'start_planning',
        ['start_planning'],
        { title: 'Start planning this card' },
        { answers: { start_planning: refusal(409, 'card_closed', 'closed') } },
      ),
    });

    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    await user.click(within(dock).getByRole('button', { name: 'Start planning' }));

    expect(await within(dock).findByRole('alert')).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: 'Start planning' })).toBeEnabled();
  });

  it('is not drawn once the server no longer lists the item', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
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

    expect(screen.queryByRole('button', NO_NEEDS_YOU)).not.toBeInTheDocument();
  });

  it('keeps a record of each raise in the chat, with no action buttons', async () => {
    renderApp({
      path: PAGE,
      routes: flowRoutes({
        events: [
          flowEvent(0, 'needs_you', {
            reason: 'A plan is waiting for you.',
            title: 'Plan v1 needs your approval',
            kind: 'plan_approval',
            actions: ['approve_plan', 'request_changes'],
          }),
        ],
      }),
    });

    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(
      await within(log).findByText('Waiting on you: Plan v1 needs your approval'),
    ).toBeInTheDocument();

    expect(within(log).queryByRole('button')).toBeNull();
  });
});

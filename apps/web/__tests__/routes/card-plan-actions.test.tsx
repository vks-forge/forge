/**
 * Pins: in `plan_ready` the owner approves only after a dialog that lists the tickets in order,
 * sends changes back with a comment of at least five characters, and edits tickets lightly
 * (rename, reorder, remove, priority) in one request, with a 409 shown in words; outside
 * `plan_ready` there are no decision buttons; the card page puts the chat beside a side panel on
 * wide screens and turns the four views into tabs below 768 px.
 *
 * Why: approving is the only path that creates tickets (d-0133). An approval with no preview, an
 *   edit that fails silently, or a decision button on a plan that is no longer waiting would each
 *   cost the owner trust in the plan.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   routes/card/plan/*, routes/card/card-body, helpers/choose.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { flowRoutes, FLOW_CARD, planFixture } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PLAN_PAGE = `/p/sample-service/cards/${FLOW_CARD}?tab=plan`;
const when = new Date().toISOString();
const ready = { phase: 'plan_ready', column: 'needs_you', needs_you: true };

const withPlan = (over: Parameters<typeof flowRoutes>[0] = {}) =>
  flowRoutes({
    ...over,
    detail: over.detail ?? ready,
    plan: {
      versions: [{ version: 1, created_at: when }],
      current: planFixture(),
      ...(over.plan ?? {}),
    },
  });

describe('Plan tab: approve and request changes', () => {
  it('asks first, naming the tickets in order, then approves that version', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PLAN_PAGE, routes: withPlan() });

    await user.click(await screen.findByRole('button', { name: 'Approve plan' }));

    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent('Approve plan v1?');
    expect(dialog).toHaveTextContent(
      'Creates 3 tickets in this order: Add a retry policy type, Wire the policy into the sender, Document the behaviour',
    );

    expect(forge.stub.callsTo('POST /cards/:id/plan/approve')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Approve plan' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/plan/approve')[0]?.body).toEqual({
        version: 1,
      }),
    );
  });

  it('leaves everything unsent when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PLAN_PAGE, routes: withPlan() });

    await user.click(await screen.findByRole('button', { name: 'Approve plan' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(forge.stub.callsTo('POST /cards/:id/plan/approve')).toHaveLength(0);
  });

  it('explains a stale plan in words', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PLAN_PAGE,
      routes: withPlan({ answers: { approve: refusal(409, 'stale_plan', 'stale') } }),
    });

    await user.click(await screen.findByRole('button', { name: 'Approve plan' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Approve plan',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /newer version of the plan/i,
    );
  });

  it('sends changes back with a comment of at least five characters', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PLAN_PAGE, routes: withPlan() });

    await user.click(await screen.findByRole('button', { name: 'Request changes' }));

    const send = await screen.findByRole('button', { name: 'Send to the Director' });

    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText('What should change?'), 'Add');

    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText('What should change?'), ' a rollout ticket');
    await user.click(send);

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /cards/:id/plan/request-changes')[0]?.body).toEqual(
        {
          version: 1,
          comment: 'Add a rollout ticket',
        },
      ),
    );
  });

  it('offers no decision on a plan that is not waiting for one', async () => {
    renderApp({
      path: PLAN_PAGE,
      routes: withPlan({ detail: { phase: 'in_progress', column: 'in_progress' } }),
    });

    await screen.findByRole('heading', { level: 3, name: 'Goal' });

    expect(
      screen.queryByRole('button', { name: 'Approve plan' }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'Request changes' }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'Edit tickets' }),
    ).not.toBeInTheDocument();
  });
});

describe('Plan tab: light ticket edits', () => {
  async function edit() {
    const user = userEvent.setup();
    const view = renderApp({
      path: PLAN_PAGE,
      routes: withPlan({
        answers: {
          edit_tickets: { status: 200, body: { plan: planFixture({ version: 2 }) } },
        },
      }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit tickets' }));

    return { user, ...view };
  }

  it('sends one request with only what changed: title, priority, removal and order', async () => {
    const { user, forge } = await edit();

    const title = screen.getByLabelText('Title of t1');
    await user.clear(title);
    await user.type(title, 'Add a retry policy');
    await choose(user, 'Priority of t1', 'High');
    await user.click(screen.getByRole('button', { name: 'Remove t3' }));
    await user.click(screen.getByRole('button', { name: 'Move t2 up' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(
        forge.stub.callsTo('PATCH /cards/:id/plan/:version/tickets')[0]?.body,
      ).toEqual({
        tickets: [
          { key: 't1', title: 'Add a retry policy', priority: 'high' },
          { key: 't3', removed: true },
        ],
        order: ['t2', 't1'],
      }),
    );

    expect(forge.stub.callsTo('PATCH /cards/:id/plan/:version/tickets')[0]?.path).toBe(
      `/cards/${FLOW_CARD}/plan/1/tickets`,
    );
  });

  it('keeps Save off until something changed and lets a removal be undone', async () => {
    const { user } = await edit();

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Remove t3' }));

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Restore t3' }));

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('shows a 409 in words, inline, and keeps the draft', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PLAN_PAGE,
      routes: withPlan({
        answers: {
          edit_tickets: refusal(409, 'ticket_has_dependents', 'has dependents'),
        },
      }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit tickets' }));
    await user.click(screen.getByRole('button', { name: 'Remove t1' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /still has others that depend on it/i,
    );

    expect(screen.getByRole('button', { name: 'Restore t1' })).toBeInTheDocument();
  });

  it('discards the draft', async () => {
    const { user } = await edit();

    await user.click(screen.getByRole('button', { name: 'Remove t2' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.queryByLabelText('Title of t1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit tickets' })).toBeInTheDocument();
  });
});

describe('Card page: layout', () => {
  const wide = (query: string) => query.includes('768');

  it('puts the chat in the main column and Plan, Tickets, Details in a side panel on wide screens', async () => {
    const { setMatchMedia } = await import('#tests/helpers/match-media.js');
    setMatchMedia(wide);
    renderApp({ path: `/p/sample-service/cards/${FLOW_CARD}`, routes: withPlan() });

    expect(await screen.findByRole('log', { name: 'Conversation' })).toBeInTheDocument();

    const tabs = within(screen.getByRole('tablist', { name: 'Card panel' })).getAllByRole(
      'tab',
    );

    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual([
      'Plan',
      'Tickets',
      'Details',
    ]);

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Goal' }),
    ).toBeInTheDocument();
  });

  it('turns into Chat, Plan, Tickets, Details tabs below 768 px', async () => {
    renderApp({ path: `/p/sample-service/cards/${FLOW_CARD}`, routes: withPlan() });

    const tabs = within(
      await screen.findByRole('tablist', { name: 'Card' }),
    ).getAllByRole('tab');

    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual([
      'Chat',
      'Plan',
      'Tickets',
      'Details',
    ]);

    expect(screen.queryByRole('tablist', { name: 'Card panel' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Goal' }),
    ).not.toBeInTheDocument();
  });
});

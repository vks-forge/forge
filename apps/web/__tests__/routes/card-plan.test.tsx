/**
 * Pins: the Plan tab shows the fixed sections of a plan in order (goal, scope and non-goals,
 * decisions, assumptions, verification, tickets with a dependency graph, card links), a floor
 * result, and a version picker with a diff against the previous version; an older version is
 * read-only; a card with no plan says so.
 *
 * Why: the owner reviews the plan before any ticket exists. A section missing from the plan the
 *   Director wrote, a version that cannot be compared, or an old version that can be approved
 *   would each cost the owner trust in the plan.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   routes/card/plan/*, helpers/choose.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';

import { flowRoutes, FLOW_CARD, planFixture } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PLAN_PAGE = `/p/sample-service/cards/${FLOW_CARD}/plan`;
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

describe('Plan tab: content', () => {
  it('shows every section of the plan, in order', async () => {
    renderApp({ path: PLAN_PAGE, routes: withPlan() });

    await screen.findByRole('heading', { level: 3, name: 'Goal' });
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

    expect(names).toEqual([
      'Goal',
      'Scope and non-goals',
      'Decisions',
      'Assumptions',
      'Verification',
      'Tickets',
      'Card links',
    ]);

    expect(
      screen.getByText('Retry failed webhook sends with backoff'),
    ).toBeInTheDocument();

    expect(screen.getByText('A dead-letter queue')).toBeInTheDocument();
    expect(screen.getByText('How many retries?')).toBeInTheDocument();
    expect(screen.getByText('Webhook targets are idempotent')).toBeInTheDocument();
    expect(screen.getByText('Only the webhook sender module')).toBeInTheDocument();
    expect(screen.getByText('src/webhooks/send.ts')).toBeInTheDocument();
    expect(screen.getByText('d-0042 keeps retries in the sender')).toBeInTheDocument();
    expect(
      screen.getByText('r-0007 rejected a separate retry service'),
    ).toBeInTheDocument();

    expect(
      screen.getByText('Duplicate sends if a target is not idempotent'),
    ).toBeInTheDocument();
  });

  it('lists tickets in order with their details and a dependency graph', async () => {
    renderApp({ path: PLAN_PAGE, routes: withPlan() });

    const list = await screen.findByRole('list', { name: 'Planned tickets' });
    const items = within(list)
      .getAllByRole('listitem', {})
      .filter((li) => li.dataset['ticket']);

    expect(items.map((li) => li.dataset['ticket'])).toEqual(['t1', 't2', 't3']);
    expect(
      within(items[1]!).getByText('Wire the policy into the sender'),
    ).toBeInTheDocument();

    expect(within(items[1]!).getByText('Depends on t1')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Failed sends retry')).toBeInTheDocument();

    const graph = screen.getByRole('img', { name: /dependency graph/i });

    expect(within(graph).getAllByText(/^t[123]$/)).toHaveLength(3);
    expect(graph.querySelectorAll('path[data-edge]')).toHaveLength(3);
  });

  it('shows the floor result: pass, or the reasons', async () => {
    const { unmount } = renderApp({
      path: PLAN_PAGE,
      routes: withPlan({ plan: { floor: { pass: true, reasons: [] } } }),
    });

    expect(await screen.findByText('Safety minimum met')).toBeInTheDocument();
    unmount();

    renderApp({
      path: PLAN_PAGE,
      routes: withPlan({
        plan: { floor: { pass: false, reasons: ['Touches the billing module'] } },
      }),
    });

    expect(await screen.findByText('Safety minimum not met')).toBeInTheDocument();
    expect(screen.getByText('Touches the billing module')).toBeInTheDocument();
  });

  it('hides the floor banner once the plan was approved (floor null) and says it was checked then', async () => {
    renderApp({
      path: PLAN_PAGE,
      routes: withPlan({
        plan: { floor: null, floor_frozen_at: '2026-10-20T09:30:00.000Z' },
      }),
    });

    expect(
      await screen.findByText(/checked when this plan was approved/),
    ).toBeInTheDocument();

    expect(screen.queryByText('Safety minimum not met')).not.toBeInTheDocument();
    expect(screen.queryByText('Safety minimum met')).not.toBeInTheDocument();
  });

  it('says there is no plan yet when the Director has not written one', async () => {
    renderApp({
      path: PLAN_PAGE,
      routes: flowRoutes({ detail: { phase: 'grilling' } }),
    });

    expect(await screen.findByText(/No plan yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve plan' }),
    ).not.toBeInTheDocument();
  });
});

describe('Plan tab: versions and diff', () => {
  const v1 = planFixture();
  const v2 = planFixture({
    version: 2,
    goal: 'Retry failed webhook sends, with jitter',
    tickets: (planFixture()['tickets'] as Record<string, unknown>[]).slice(0, 2),
  });

  const routes = flowRoutes({
    detail: ready,
    plan: {
      versions: [
        { version: 1, created_at: when },
        { version: 2, created_at: when },
      ],
      current: v2,
    },
    versions: { 1: v1 },
  });

  it('opens on the latest version and shows what changed since the previous one', async () => {
    const user = userEvent.setup();
    renderApp({ path: PLAN_PAGE, routes });

    expect(
      await screen.findByRole('combobox', { name: 'Plan version' }),
    ).toHaveTextContent('v2');

    await user.click(screen.getByRole('button', { name: 'Show changes since v1' }));

    const diff = await screen.findByRole('region', { name: 'Changes since v1' });

    expect(within(diff).getByText('Goal')).toBeInTheDocument();
    expect(
      within(diff).getByText('Retry failed webhook sends, with jitter'),
    ).toBeInTheDocument();

    expect(within(diff).getByText('Ticket t3')).toBeInTheDocument();
  });

  it('opens an older version read-only', async () => {
    const user = userEvent.setup();
    renderApp({ path: PLAN_PAGE, routes });
    await screen.findByRole('combobox', { name: 'Plan version' });

    await choose(user, 'Plan version', /v1/);

    expect(
      await screen.findByText('Retry failed webhook sends with backoff'),
    ).toBeInTheDocument();

    expect(screen.getByText(/older version/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve plan' }),
    ).not.toBeInTheDocument();
  });
});

describe('Plan tab: what approval cancels', () => {
  it('lists what will be cancelled and what the new plan does not cover', async () => {
    renderApp({
      path: PLAN_PAGE,
      routes: withPlan({
        plan: {
          will_cancel: [
            { id: 'CHE-3', title: 'Auth.js' },
            { id: 'CHE-6', title: 'LLM client' },
          ],
          not_covered: [{ id: 'CHE-6', title: 'LLM client' }],
        },
      }),
    });

    const cancelled = await screen.findByRole('list', {
      name: 'Will be cancelled when you approve',
    });

    expect(within(cancelled).getAllByRole('listitem')).toHaveLength(2);
    const uncovered = screen.getByRole('list', { name: 'Not covered by the new plan' });

    expect(within(uncovered).getByText('CHE-6')).toBeInTheDocument();
    expect(within(uncovered).queryByText('CHE-3')).not.toBeInTheDocument();
  });

  it('shows neither list when approval cancels nothing', async () => {
    renderApp({ path: PLAN_PAGE, routes: withPlan() });

    await screen.findByRole('heading', { level: 3, name: 'Goal' });

    expect(
      screen.queryByRole('list', { name: 'Will be cancelled when you approve' }),
    ).not.toBeInTheDocument();
  });
});

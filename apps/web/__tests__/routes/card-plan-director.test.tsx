/**
 * Pins: a plan ticket the Director gave pipeline changes shows its pipeline as the lane plus those
 * changes, each with its reason; a change that removes a stage is flagged "Needs your approval";
 * the floor says the plan waits for the owner; and while editing, the owner can take a change off
 * (undoable until saved) and the request names it by position, never adding one.
 *
 * Why: approving a plan is approving every pipeline change in it. A change hidden in a ticket's body,
 * a lighter pipeline that looks like any other, or an edit that cannot narrow what the Director
 * proposed would each let the Director shape the work without the owner seeing it.
 * Depends on: routes/card/plan/{plan-tickets,plan-ticket-editor,plan-pipeline-ops}, the stubbed
 * Forge server via helpers/render-app and helpers/flow-fixtures.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { flowRoutes, FLOW_CARD, planFixture } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PLAN_PAGE = `/p/sample-service/cards/${FLOW_CARD}/plan`;
const when = new Date().toISOString();
const PATCH = 'PATCH /cards/:id/plan/:version/tickets';

const SECURITY = {
  id: 'dir-security',
  kind: 'agent',
  label: 'Security review',
  agent: 'reviewer',
};

/** t2 adds a security review and removes the review; t1 only adds one. */
function directorPlan(): Record<string, unknown> {
  const base = planFixture();
  const tickets = (base['tickets'] as Record<string, unknown>[]).map((t) => {
    if (t['key'] === 't2') {
      return {
        ...t,
        pipeline: {
          ops: [
            {
              op: 'add',
              stage: SECURITY,
              after: 'g1',
              reason: 'It touches the sender used by every webhook.',
            },
            { op: 'remove', stage_id: 'review', reason: 'The change is mostly types.' },
          ],
        },
      };
    }

    return t['key'] === 't1'
      ? {
          ...t,
          pipeline: {
            ops: [
              {
                op: 'add',
                stage: SECURITY,
                after: 'g1',
                reason: 'The policy decides how much is retried.',
              },
            ],
          },
        }
      : t;
  });

  return { ...base, tickets };
}

function open(over: { floor?: unknown } = {}) {
  return renderApp({
    path: PLAN_PAGE,
    routes: flowRoutes({
      detail: { phase: 'plan_ready', column: 'needs_you', needs_you: true },
      plan: {
        versions: [{ version: 1, created_at: when }],
        current: directorPlan(),
        ...(over.floor === undefined ? {} : { floor: over.floor }),
      },
      answers: {
        edit_tickets: { status: 200, body: { plan: planFixture({ version: 2 }) } },
      },
    }),
  });
}

describe('Plan tab: Director pipeline changes', () => {
  it('shows the lane plus the changes, each with its reason', async () => {
    open();

    const t2 = await screen.findByRole('group', { name: 'Pipeline of t2' });

    expect(t2).toHaveTextContent('Standard + 2 Director changes');
    expect(t2).toHaveTextContent(
      'Add Security review after g1: It touches the sender used by every webhook.',
    );

    expect(t2).toHaveTextContent('Remove review: The change is mostly types.');

    expect(screen.getByRole('group', { name: 'Pipeline of t1' })).toHaveTextContent(
      'Express + 1 Director change',
    );
  });

  it('flags only the pipeline that removes a stage as needing approval', async () => {
    open();

    const t2 = await screen.findByRole('group', { name: 'Pipeline of t2' });

    expect(
      within(t2).getByText('Needs your approval: removes review'),
    ).toBeInTheDocument();

    expect(
      within(screen.getByRole('group', { name: 'Pipeline of t1' })).queryByText(
        /Needs your approval/,
      ),
    ).toBeNull();
  });

  it('shows the floor reason that makes the plan wait for the owner', async () => {
    open({
      floor: {
        pass: false,
        reasons: ['t2 runs a lighter pipeline than its lane (removes review)'],
      },
    });

    expect(await screen.findByText('Floor check did not pass')).toBeInTheDocument();
    expect(
      screen.getByText('t2 runs a lighter pipeline than its lane (removes review)'),
    ).toBeInTheDocument();
  });

  it('shows nothing extra on a ticket with no Director changes', async () => {
    open();

    await screen.findByRole('group', { name: 'Pipeline of t2' });

    expect(screen.queryByRole('group', { name: 'Pipeline of t3' })).toBeNull();
  });
});

describe('Plan tab: taking a Director change off', () => {
  async function edit() {
    const user = userEvent.setup();
    const view = open();

    await user.click(await screen.findByRole('button', { name: 'Edit tickets' }));

    return { user, ...view };
  }

  it('sends the position of the change taken off, and nothing else changed', async () => {
    const { user, forge } = await edit();

    await user.click(
      screen.getByRole('button', { name: 'Take off: Remove review (t2)' }),
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(PATCH)[0]?.body).toEqual({
        tickets: [{ key: 't2', drop_pipeline_ops: [1] }],
      }),
    );
  });

  it('lets a change be kept again before saving', async () => {
    const { user } = await edit();
    await user.click(
      screen.getByRole('button', { name: 'Take off: Remove review (t2)' }),
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Keep: Remove review (t2)' }));

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('offers no way to add a change', async () => {
    await edit();

    expect(screen.queryByRole('button', { name: /add .*change/i })).toBeNull();
  });
});

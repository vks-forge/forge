/**
 * Pins: the plan ticket editor has a care-level (lane) picker per ticket that sends `lane` only
 * when it changed, and marks a lane the owner chose as "Set by you".
 *
 * Why: the owner knows when a ticket is bigger or riskier than the Director sized it. Without the
 *   picker they could only ask for changes in words; without the "Set by you" mark they could not
 *   tell a lane they chose (which the automatic size checks now leave alone) from the Director's.
 * Depends on: routes/card/plan/plan-ticket-editor, helpers/flow-fixtures, helpers/choose.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose, chosen } from '#tests/helpers/choose.js';
import { FLOW_CARD, flowRoutes, planFixture } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PLAN_PAGE = `/p/sample-service/cards/${FLOW_CARD}/plan`;
const PATCH = 'PATCH /cards/:id/plan/:version/tickets';
const ready = { phase: 'plan_ready', column: 'needs_you', needs_you: true };

function open(current = planFixture()) {
  const user = userEvent.setup();
  const view = renderApp({
    path: PLAN_PAGE,
    routes: flowRoutes({
      detail: ready,
      plan: { versions: [{ version: 1, created_at: new Date().toISOString() }], current },
      answers: {
        edit_tickets: { status: 200, body: { plan: planFixture({ version: 2 }) } },
      },
    }),
  });

  return { user, ...view };
}

describe('Plan ticket editor: care level', () => {
  it('shows each ticket lane in plain words and saves only the one that changed', async () => {
    const { user, forge } = open();

    await user.click(await screen.findByRole('button', { name: 'Edit tickets' }));

    expect(chosen('Care level of t1')).toContain('Express');
    expect(chosen('Care level of t2')).toContain('Standard');

    await choose(user, 'Care level of t1', /^Full/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(PATCH)[0]?.body).toEqual({
        tickets: [{ key: 't1', lane: 'full' }],
      }),
    );
  });

  it('says "Set by you" once the owner picks a lane, and for a lane chosen earlier', async () => {
    const tickets = (planFixture().tickets as Record<string, unknown>[]).map((t) =>
      t['key'] === 't2' ? { ...t, lane: 'full', lane_by_owner: true } : t,
    );

    const { user } = open(planFixture({ tickets }));

    await user.click(await screen.findByRole('button', { name: 'Edit tickets' }));

    expect(screen.getAllByText('Set by you')).toHaveLength(1);

    await choose(user, 'Care level of t1', /^Standard/);

    expect(screen.getAllByText('Set by you')).toHaveLength(2);
    expect(
      screen.getAllByText(/Protected files still run in Full/).length,
    ).toBeGreaterThan(0);
  });
});

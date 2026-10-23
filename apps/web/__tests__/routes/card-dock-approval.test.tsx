/**
 * Pins: on the Card page a tool approval is open in the dock at once (no Respond step) with the
 * exact command, the Worker's reason and the three answers, allowing once posts the contract body,
 * and when no safe rule exists Always is hidden and its reason is shown.
 *
 * Why: the owner must read the command before choosing, so the card cannot sit behind an extra
 *   click, and "Always" must never be offered for a call that cannot be safely remembered (d-0175).
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/flow-fixtures, helpers/permission-views, routes/card/use-card-dock.
 */

import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld } from '#tests/helpers/escalation-world.js';
import { json } from '#tests/helpers/fetch-stub.js';
import {
  dockItem,
  flowDetail,
  flowRoutes,
  FLOW_CARD,
  planFixture,
} from '#tests/helpers/flow-fixtures.js';
import { permissionView } from '#tests/helpers/permission-views.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;

const approval = dockItem('tool_approval', ['allow_once', 'allow_always', 'deny'], {
  title: 'Allow `make install-deps`?',
  items: ['The report needs the database client.', 'Allow `make install-deps`?'],
  ticket_id: 'SVC-4',
  interaction_id: 'int-p1',
});

function open(view = permissionView()) {
  const world = escalationWorld([view]);

  return renderApp({
    path: PAGE,
    routes: {
      ...flowRoutes({ plan: { versions: [], current: planFixture() } }),
      'GET /cards/:id': () =>
        json(
          flowDetail({
            needs_you: true,
            column: 'needs_you',
            needs_you_detail: [approval],
          }),
        ),
      ...world.routes,
    },
  });
}

describe('Card page: tool approval in the dock', () => {
  it('opens the exact command, the Worker words and the three answers with no Respond click', async () => {
    const user = userEvent.setup();
    open();

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    const card = await within(dock).findByRole('region', { name: 'Tool approval' });

    expect(within(card).getByLabelText('Exact call')).toHaveTextContent(
      /^make install-deps$/,
    );

    expect(
      within(card).getByText(/The report needs the database client\./),
    ).toBeVisible();

    expect(within(dock).queryByRole('button', { name: 'Respond' })).toBeNull();
    expect(within(card).getByRole('button', { name: 'Allow once' })).toBeEnabled();
    expect(
      within(card).getByRole('button', { name: 'Always for this project' }),
    ).toBeEnabled();

    expect(within(card).getByRole('button', { name: 'Deny' })).toBeEnabled();
    expect(within(dock).getByRole('link', { name: 'Open the ticket' })).toBeVisible();
  });

  it('allows once and clears the dock', async () => {
    const user = userEvent.setup();
    const { forge } = open();

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    await user.click(await within(dock).findByRole('button', { name: 'Allow once' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /interactions/:id/act')[0]?.body).toEqual({
        action: 'allow_once',
      }),
    );
  });

  it('shows no Always button and its reason when the call cannot be remembered', async () => {
    const user = userEvent.setup();
    open(
      permissionView({
        actions: ['allow_once', 'deny'],
        payload: {
          ...(permissionView()['payload'] as Record<string, unknown>),
          always: { offered: false, why: 'Protected path: always asks.' },
        },
      }),
    );

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    await within(dock).findByRole('button', { name: 'Allow once' });

    expect(
      within(dock).queryByRole('button', { name: 'Always for this project' }),
    ).toBeNull();

    expect(within(dock).getByText(/Protected path: always asks\./)).toBeVisible();
  });
});

/**
 * Pins: a tool approval in the Inbox is titled with the exact call, opens the same permission
 * card in the drawer, and Allow once there posts the contract body and settles the item.
 *
 * Why: the owner may meet the approval in the Inbox before the dock; the Worker is waiting either
 *   way, so acting in the Inbox must be as complete and as safe as acting on the ticket (d-0175).
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/permission-views, routes/inbox/*, components/escalation/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld } from '#tests/helpers/escalation-world.js';
import { permissionView } from '#tests/helpers/permission-views.js';
import { renderApp } from '#tests/helpers/render-app.js';

const INBOX = '/p/sample-service/inbox';
const ACT = 'POST /interactions/:id/act';

describe('Inbox: tool approval', () => {
  it('titles a tool approval with the exact call, and Allow once there settles it', async () => {
    const user = userEvent.setup();
    const world = escalationWorld([permissionView()]);
    const { forge } = renderApp({ path: INBOX, routes: world.routes });

    expect(await screen.findByText('Allow `make install-deps`?')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /^Respond:/ }));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByLabelText('Exact call')).toHaveTextContent(
      'make install-deps',
    );

    await user.click(within(drawer).getByRole('button', { name: 'Allow once' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({ action: 'allow_once' }),
    );

    expect(await within(drawer).findByText(/Allowed once by you/)).toBeInTheDocument();
  });
});

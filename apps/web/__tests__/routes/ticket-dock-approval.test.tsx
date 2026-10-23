/**
 * Pins: a tool approval on the Ticket page is answered in the dock where it is read: the exact
 * command (hidden characters made visible), the Worker's reason, the rule in plain words, Allow
 * once / Always for this project / Deny with an optional note, keys 1 to 3, Always hidden with
 * its reason when no safe rule exists, and a link from the Worker thread that brings the item
 * to the front.
 *
 * Why: the Worker is waiting on this answer and the owner is usually not a programmer, so the
 *   card must show what would run, never a reworded version, and each answer must reach the
 *   server as the contract body (d-0175).
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/permission-views, routes/ticket/*, components/escalation/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld, questionView } from '#tests/helpers/escalation-world.js';
import { permissionView } from '#tests/helpers/permission-views.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { DOCK_OPEN_EVENT } from '#/domain/needs-you-dock.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const ACT = 'POST /interactions/:id/act';

function open(views: Parameters<typeof escalationWorld>[0]) {
  const world = escalationWorld(views);

  return { world, ...renderApp({ path: TICKET, routes: world.routes }) };
}

describe('Ticket page dock: tool approval', () => {
  const dockOf = () => openNeedsYou(userEvent.setup(), 'Waiting on you (1)');

  it('shows the exact command, the Worker words, the rule in plain words and the three answers', async () => {
    open([permissionView()]);

    const dock = await dockOf();

    expect(
      within(dock).getByRole('heading', { name: 'Allow `make install-deps`?' }),
    ).toBeVisible();

    expect(within(dock).getByLabelText('Exact call')).toHaveTextContent(
      /^make install-deps$/,
    );

    expect(
      within(dock).getByText(/Why \(the Worker’s words\):/).parentElement,
    ).toHaveTextContent('The report needs the database client.');

    expect(
      within(dock).getByText(
        /need your approval in the Full lane \(the most careful way/,
      ),
    ).toBeVisible();

    expect(within(dock).getByRole('button', { name: 'Allow once' })).toBeEnabled();
    expect(
      within(dock).getByRole('button', { name: 'Always for this project' }),
    ).toBeEnabled();

    expect(within(dock).getByRole('button', { name: 'Deny' })).toBeEnabled();
    expect(
      within(dock).getByText(
        /Always allow the command `make install-deps`, in this project only/,
      ),
    ).toBeVisible();

    // Raw reason codes and lane words never appear alone.
    expect(within(dock).queryByText(/rule_ask/)).toBeNull();
  });

  it('allows once from the dock and keeps a one-line record', async () => {
    const user = userEvent.setup();
    const { forge } = open([permissionView()]);

    const dock = await dockOf();
    await user.click(within(dock).getByRole('button', { name: 'Allow once' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({ action: 'allow_once' }),
    );

    expect(await screen.findByText(/Allowed once by you/)).toBeVisible();
  });

  it('allows always from the dock', async () => {
    const user = userEvent.setup();
    const { forge } = open([permissionView()]);

    const dock = await dockOf();
    await user.click(
      within(dock).getByRole('button', { name: 'Always for this project' }),
    );

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({ action: 'allow_always' }),
    );

    expect(await screen.findByText(/Allowed for this project by you/)).toBeVisible();
  });

  it('denies with a note the Worker reads, or without one', async () => {
    const user = userEvent.setup();
    const { forge } = open([permissionView()]);

    const dock = await dockOf();
    await user.click(
      within(dock).getByRole('button', { name: 'Add a note for the Worker' }),
    );

    await user.type(
      within(dock).getByRole('textbox', { name: /Note for the Worker/ }),
      'use the vendored copy',
    );

    await user.click(within(dock).getByRole('button', { name: 'Deny' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({
        action: 'deny',
        note: 'use the vendored copy',
      }),
    );

    expect(await screen.findByText(/Denied by you/)).toBeVisible();
  });

  it('hides Always and says why when it is not offered', async () => {
    open([
      permissionView({
        actions: ['allow_once', 'deny'],
        payload: {
          ...(permissionView()['payload'] as Record<string, unknown>),
          always: { offered: false, why: 'A chain of commands is approved each time.' },
        },
      }),
    ]);

    const dock = await dockOf();

    expect(
      within(dock).queryByRole('button', { name: 'Always for this project' }),
    ).toBeNull();

    expect(
      within(dock).getByText(
        /“Always” is not offered here\. A chain of commands is approved each time\./,
      ),
    ).toBeVisible();

    expect(within(dock).getByRole('button', { name: 'Allow once' })).toBeEnabled();
  });

  it('makes hidden characters in the command visible', async () => {
    const flip = String.fromCharCode(0x202e);
    open([
      permissionView({
        payload: {
          ...(permissionView()['payload'] as Record<string, unknown>),
          what: `make ${flip}deploy`,
        },
      }),
    ]);

    const dock = await dockOf();

    expect(within(dock).getByLabelText('Exact call')).toHaveTextContent(
      'make ‹U+202E›deploy',
    );

    expect(within(dock).getByRole('note')).toHaveTextContent(/1 hidden character/);
  });

  it('opens the modal at this item when the Worker thread link asks for it', async () => {
    open([questionView(), permissionView({ escalated_at: new Date().toISOString() })]);

    await screen.findByText('Needs your attention · 2');

    expect(screen.queryByLabelText('Exact call')).toBeNull();

    window.dispatchEvent(
      new CustomEvent(DOCK_OPEN_EVENT, { detail: { interactionId: 'int-p1' } }),
    );

    const dock = await screen.findByRole('region', { name: 'Waiting on you (2)' });

    expect(await within(dock).findByLabelText('Exact call')).toHaveTextContent(
      'make install-deps',
    );
  });

  it('answers with the keys 1, 2 and 3 while focus is in the dock', async () => {
    const user = userEvent.setup();
    const { forge } = open([permissionView()]);

    const dock = await dockOf();
    dock.focus();
    await user.keyboard('2');

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({ action: 'allow_always' }),
    );
  });
});

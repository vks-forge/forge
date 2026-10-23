/**
 * Ticket page: editing priority, waits and description from the Details tab.
 *
 * Why: the owner could not raise a priority, fix a brief or order one ticket before another once
 *   a plan was approved. The form must offer only what Forge will accept (a started ticket keeps
 *   its brief and cannot be made to wait), send only what changed, say in plain words why Forge
 *   refused (a loop), and leave a finished ticket alone.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/fetch-stub.
 *
 * Pins: a not-started ticket shows all three fields and sends only the changed ones; a started
 *   ticket shows the description as locked and disables new waits; a refusal is shown as the
 *   server's sentence and the form stays open; a done ticket has no edit button; nothing is sent
 *   when nothing changed (Save disabled).
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';

const page = (id: string) => `/p/sample-service/tickets/${id}/details`;
const editButton = () => screen.findByRole('button', { name: 'Edit this ticket' });

describe('Ticket Details: edit', () => {
  it('sends only the changed fields for a ticket that has not started', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: page('SVC-7'),
      routes: { 'PATCH /tickets/:id': () => json({ ticket: {} }) },
    });

    await user.click(await editButton());
    const form = screen.getByRole('form', { name: 'Edit ticket' });
    expect(within(form).getByLabelText('Description')).toBeVisible();
    expect(within(form).getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.clear(within(form).getByLabelText('Priority'));
    await user.type(within(form).getByLabelText('Priority'), '3');
    await user.click(await within(form).findByRole('checkbox', { name: /SVC-5/ }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(forge.stub.callsTo('PATCH /tickets/:id')).toEqual([
      expect.objectContaining({
        path: '/tickets/SVC-7',
        body: { priority: 3, depends_on: ['SVC-5'] },
      }),
    ]);
  });

  it('locks the description and new waits of a ticket that has started', async () => {
    const user = userEvent.setup();
    renderApp({ path: page('SVC-3') });

    await user.click(await editButton());
    const form = screen.getByRole('form', { name: 'Edit ticket' });

    expect(within(form).queryByLabelText('Description')).toBeNull();
    expect(within(form).getByText(/The description is locked/)).toBeVisible();
    expect(await within(form).findByRole('checkbox', { name: /SVC-5/ })).toBeDisabled();
  });

  it('shows the refusal in the server words and keeps the form open', async () => {
    const user = userEvent.setup();
    renderApp({
      path: page('SVC-7'),
      routes: {
        'PATCH /tickets/:id': () =>
          refusal(
            409,
            'dependency_cycle',
            'that would make tickets wait on each other: SVC-7 -> SVC-5 -> SVC-7',
          ),
      },
    });

    await user.click(await editButton());
    const form = screen.getByRole('form', { name: 'Edit ticket' });
    await user.click(await within(form).findByRole('checkbox', { name: /SVC-5/ }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'that would make tickets wait on each other',
    );

    expect(screen.getByRole('form', { name: 'Edit ticket' })).toBeVisible();
  });

  it('offers no edit on a finished ticket', async () => {
    renderApp({ path: page('SVC-1') });

    expect(await screen.findByText('Depends on')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit this ticket' })).toBeNull();
  });
});

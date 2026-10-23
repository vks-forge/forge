/**
 * Pins: the Ticket page offers "Cancel ticket…" in its header menu while the server says the
 * ticket can be cancelled (and not for a finished one), the dialog is the shared cancel
 * confirmation (Keep running / Cancel <id>, an optional reason, the tickets that wait on it listed
 * and cancelled together), the post is `/tickets/:id/act {action: 'cancel'}`; a finished ticket
 * never shows "Waiting on" and leads with its outcome; an open ticket waits only on what the server
 * says it still waits for; the steer box counts toward and blocks over its 8,000-character limit.
 *
 * Why: a running ticket the owner no longer wants had no way to be stopped, a done ticket read
 *   "Waiting on FR-5" because of an old dependency, and a long paste came back as a bare refusal.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/fake-forge/ticket-routes,
 *   routes/ticket/*, components/escalation/*, components/card/message-composer.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ticketRoutes } from '#tests/helpers/fake-forge/ticket-routes.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes, StubRequest } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';

const ticketPath = (id: string) => `/p/sample-service/tickets/${id}`;
const ACT = 'POST /tickets/:id/act';

const base = ticketRoutes({ empty: false })['GET /tickets/:id'] as (
  request: StubRequest,
) => { body: Record<string, unknown> };

/** The sample ticket detail with the fields a test is about replaced. */
function detailRoutes(
  patch: (detail: Record<string, unknown>) => Record<string, unknown>,
): Routes {
  return {
    'GET /tickets/:id': (request) => json(patch(base(request).body)),
  };
}

/** The same detail with the ticket's own fields changed. */
const withTicket =
  (change: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  (detail: Record<string, unknown>) => ({
    ...detail,
    ticket: { ...(detail['ticket'] as object), ...change },
    ...extra,
  });

const cancelRead = (dependents: { id: string; title: string }[]) => ({
  action: 'cancel',
  ticket: { id: 'SVC-3', title: 'Stream large CSV' },
  run_active: true,
  branch: 'forge/SVC-3',
  has_worktree: true,
  pr_number: null,
  dependents,
});

async function openCancel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Ticket actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Cancel ticket…' }));

  return screen.findByRole('alertdialog');
}

describe('Ticket header: Cancel ticket…', () => {
  it('cancels a running ticket from the header menu with the reason, never with two buttons named Cancel', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: ticketPath('SVC-3'),
      routes: {
        [ACT]: json({ ticket_id: 'SVC-3', action: 'cancel' }),
        'GET /tickets/:id/consequences': json(cancelRead([])),
      },
    });

    const dialog = await openCancel(user);

    expect(within(dialog).getByRole('button', { name: 'Keep running' })).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();

    expect(dialog).toHaveTextContent(
      /The Worker stops now and nothing from this ticket is merged/,
    );

    await user.type(
      within(dialog).getByLabelText('Why? (optional)'),
      'The design changed, do it on the card instead',
    );

    const confirm = within(dialog).getByRole('button', { name: 'Cancel SVC-3' });

    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]).toMatchObject({
        path: '/tickets/SVC-3/act',
        body: {
          action: 'cancel',
          reason: 'The design changed, do it on the card instead',
        },
      }),
    );

    expect(await screen.findByText('SVC-3 cancelled')).toBeInTheDocument();
  });

  it('sends no reason when none was typed, and Keep running leaves the ticket alone', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: ticketPath('SVC-3'),
      routes: {
        [ACT]: json({ ticket_id: 'SVC-3', action: 'cancel' }),
        'GET /tickets/:id/consequences': json(cancelRead([])),
      },
    });

    const dialog = await openCancel(user);

    await user.click(within(dialog).getByRole('button', { name: 'Keep running' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    expect(forge.stub.callsTo(ACT)).toHaveLength(0);

    const again = await openCancel(user);

    await waitFor(() =>
      expect(within(again).getByRole('button', { name: 'Cancel SVC-3' })).toBeEnabled(),
    );

    await user.click(within(again).getByRole('button', { name: 'Cancel SVC-3' }));
    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({ action: 'cancel' }),
    );
  });

  it('names the tickets that wait on it and cancels them together (the cascade step)', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: ticketPath('SVC-3'),
      routes: {
        [ACT]: json({ ticket_id: 'SVC-3', action: 'cancel' }),
        'GET /tickets/:id/consequences': json(
          cancelRead([{ id: 'SVC-9', title: 'Remove the v1 endpoints' }]),
        ),
      },
    });

    const dialog = await openCancel(user);

    expect(await within(dialog).findByRole('link', { name: 'SVC-9' })).toBeVisible();

    const confirm = within(dialog).getByRole('button', {
      name: 'Cancel SVC-3 and 1 waiting',
    });

    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({
        action: 'cancel',
        cascade: true,
      }),
    );
  });

  it('still lists the dependents the page already knows when the live read cannot load', async () => {
    const user = userEvent.setup();
    renderApp({
      path: ticketPath('SVC-3'),
      routes: {
        ...detailRoutes((detail) => ({ ...detail, dependents: ['SVC-9'] })),
        'GET /tickets/:id/consequences': refusal(500, 'internal', 'boom'),
      },
    });

    const dialog = await openCancel(user);

    expect(await within(dialog).findByRole('link', { name: 'SVC-9' })).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel SVC-3 and 1 waiting' }),
    ).toBeVisible();
  });

  it('offers no menu on a finished ticket', async () => {
    renderApp({ path: ticketPath('SVC-1') });

    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('button', { name: 'Ticket actions' }),
    ).not.toBeInTheDocument();
  });
});

describe('Ticket header: what it waits on', () => {
  it('leads a done ticket with its outcome and never says "Waiting on", whatever it once depended on', async () => {
    renderApp({
      path: ticketPath('SVC-1'),
      routes: detailRoutes(withTicket({ blocked_by: ['SVC-2'] }, { open_blockers: [] })),
    });

    expect(await screen.findByText(/^Merged at /)).toBeInTheDocument();
    expect(screen.queryByText(/Waiting on/)).not.toBeInTheDocument();
  });

  it('shows only the blockers the server still counts as open for an unfinished ticket', async () => {
    renderApp({
      path: ticketPath('SVC-6'),
      routes: detailRoutes(
        withTicket({ blocked_by: ['SVC-1', 'SVC-5'] }, { open_blockers: ['SVC-5'] }),
      ),
    });

    const line = await screen.findByText(/^Waiting on/);

    expect(line).toHaveTextContent('Waiting on SVC-5');
    expect(line).not.toHaveTextContent('SVC-1');
  });

  it('labels the full list "Depends on" in Details', async () => {
    renderApp({
      path: `${ticketPath('SVC-1')}/details`,
      routes: detailRoutes(withTicket({ blocked_by: ['SVC-2'] }, { open_blockers: [] })),
    });

    expect(await screen.findByText('Depends on')).toBeInTheDocument();
    expect(screen.queryByText('Waiting on')).not.toBeInTheDocument();
  });
});

describe('Message the Worker: the length limit', () => {
  it('counts from 90 percent, and over 8,000 characters says so and blocks the send', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: ticketPath('SVC-3'),
      routes: { 'POST /runs/:id/steer': json({}) },
    });

    const box = await screen.findByLabelText('Message the Worker');

    await user.click(box);
    await user.paste('x'.repeat(7300));
    expect(await screen.findByText('7,300 / 8,000')).toBeInTheDocument();

    await user.paste('y'.repeat(901));

    expect(
      await screen.findByText(
        /Messages can be up to 8,000 characters; this one has 8,201\./,
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send to Worker' })).toBeDisabled();

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(forge.stub.callsTo('POST /runs/:id/steer')).toHaveLength(0);
  });
});

/**
 * Pins: a setup escalation links to the fix, promises to resume by itself and rechecks on request
 * (and says what is still broken where the owner clicked); while the Director is still looking
 * nothing is asked of the owner; a wait with no question (review, scheduler hold) still offers
 * its actions.
 *
 * Why: a missing login that only says "failed", or a ticket in review with no way to send it back,
 *   leaves the owner stuck with no way forward (d-0135).
 * Depends on: the stubbed Forge server via helpers/render-app and helpers/escalation-world,
 *   components/escalation/escalation-setup, routes/ticket/ticket-wait.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  escalationWorld,
  questionView,
  setupView,
} from '#tests/helpers/escalation-world.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const ACT = 'POST /interactions/:id/act';

function open(views: Parameters<typeof escalationWorld>[0], opts = {}, path = TICKET) {
  const world = escalationWorld(views, opts);

  return { world, ...renderApp({ path, routes: world.routes }) };
}

const bodyOf = (forge: { stub: { callsTo: (p: string) => { body: unknown }[] } }) =>
  forge.stub.callsTo(ACT)[0]?.body;

describe('Ticket page: setup escalation', () => {
  it('links to the fix, promises to resume by itself and rechecks on request', async () => {
    const user = userEvent.setup();
    const { forge } = open([setupView()]);
    await openNeedsYou(userEvent.setup());

    const fix = await screen.findByRole('link', { name: 'Fix in settings' });

    expect(fix).toHaveAttribute('href', '/settings/harnesses/claude-code#tools');
    expect(screen.getByText(/resumes by itself once this is fixed/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'I fixed it, check again' }));

    await waitFor(() => expect(bodyOf(forge)).toEqual({ action: 'recheck' }));
  });

  it('shows what is still broken right where the owner clicked', async () => {
    const user = userEvent.setup();
    open([setupView()], { stillBroken: 'the login is still missing.' });
    await openNeedsYou(userEvent.setup());

    await user.click(
      await screen.findByRole('button', { name: 'I fixed it, check again' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /still not fixed: the login is still missing\./,
    );

    expect(screen.getByRole('button', { name: 'I fixed it, check again' })).toBeEnabled();
  });
});

describe('Ticket page: waiting without a question', () => {
  it('says the Director is looking, offers the card no buttons, and keeps Cancel from wait_actions', async () => {
    // The server gives a director-stage view no actions and the ticket `wait_actions: ['cancel']`.
    open([questionView({ stage: 'director', escalated_at: undefined, actions: [] })], {
      waitActions: { 'SVC-4': ['cancel'] },
    });

    const card = await screen.findByRole('region', { name: 'The Worker has a question' });

    expect(within(card).getByRole('status')).toHaveTextContent(
      'Director is looking at this',
    );

    expect(within(card).queryByRole('button')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Cancel ticket' })).toBeEnabled();
  });

  it('offers rework and cancel on a ticket in review, and posts rework with its comment', async () => {
    const user = userEvent.setup();
    const { forge } = open(
      [],
      { waitActions: { 'SVC-5': ['rework', 'cancel'] } },
      '/p/sample-service/tickets/SVC-5/review',
    );

    await openNeedsYou(userEvent.setup());

    expect(await screen.findByText('SVC-5 is ready for review')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send back for rework' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'cover the empty case');
    await user.click(within(dialog).getByRole('button', { name: 'Send back' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /tickets/:id/act')[0]?.body).toEqual({
        action: 'rework',
        comment: 'cover the empty case',
      }),
    );
  });

  it('asks before merging: Approve and merge opens a confirmation, and only its button posts approve', async () => {
    const user = userEvent.setup();
    const { forge } = open(
      [],
      { waitActions: { 'SVC-5': ['approve', 'rework', 'cancel'] } },
      '/p/sample-service/tickets/SVC-5/review',
    );

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Approve and merge' }));
    expect(forge.stub.callsTo('POST /tickets/:id/act')).toHaveLength(0);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/cannot be undone from Forge/);
    await user.click(within(dialog).getByRole('button', { name: 'Approve and merge' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /tickets/:id/act')[0]?.body).toEqual({
        action: 'approve',
      }),
    );
  });

  it('says a scheduler hold clears by itself and still offers Cancel', async () => {
    open([], { waitActions: { 'SVC-6': ['cancel'] } }, '/p/sample-service/tickets/SVC-6');

    expect(
      await screen.findByText(/has not started: cap: per-project 1\/1/),
    ).toBeInTheDocument();

    expect(screen.getByText('It starts by itself when that clears.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel ticket' })).toBeEnabled();
  });
});

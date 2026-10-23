/**
 * Pins: everything that waits on the owner on the Ticket page is in one dock directly above the
 * steer box: not drawn at all with nothing waiting, one item at a time with `n of N` whatever the
 * count (the height does not grow), a question answered in place, a sign-off approved in place
 * behind its confirm, and a scheduler hold that offers only Cancel kept outside the dock.
 *
 * Why: waiting items used to stack as amber boxes above the tabs and push the Worker thread off
 *   the screen. Acting next to the thread is the point of the redesign, so each item kind must
 *   still reach its server call from here (d-0172).
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/finished-work-views, routes/ticket/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  escalationWorld,
  failureView,
  questionView,
} from '#tests/helpers/escalation-world.js';
import { signOffView } from '#tests/helpers/finished-work-views.js';
import { NO_NEEDS_YOU, openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const ACT = 'POST /interactions/:id/act';

function open(views: Parameters<typeof escalationWorld>[0], opts = {}, path = TICKET) {
  const world = escalationWorld(views, opts);

  return { world, ...renderApp({ path, routes: world.routes }) };
}

describe('Ticket page dock: how many items', () => {
  it('draws no dock and no empty box when nothing waits', async () => {
    open([]);

    await screen.findByRole('log', { name: 'Worker messages' });

    expect(screen.queryByRole('button', NO_NEEDS_YOU)).toBeNull();
  });

  it('shows one item with its title and no stepper', async () => {
    const user = userEvent.setup();
    open([questionView()]);

    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    expect(within(dock).getAllByRole('heading')[0]).toBeVisible();
    expect(
      within(dock).getByRole('region', { name: 'The Worker has a question' }),
    ).toBeVisible();

    expect(within(dock).queryByRole('button', { name: /Next waiting item/ })).toBeNull();
  });

  it('lists three items together in one modal, behind one alert with the count', async () => {
    const user = userEvent.setup();
    open([
      questionView(),
      failureView('rework_cap', { id: 'int-f1', escalated_at: new Date().toISOString() }),
      signOffView('tier_b', { id: 'int-so' }),
    ]);

    expect(await screen.findByText('Needs your attention · 3')).toBeVisible();

    const dock = await openNeedsYou(user, 'Waiting on you (3)');

    expect(screen.getAllByRole('region', { name: /Waiting on you/ })).toHaveLength(1);
    expect(within(dock).getAllByRole('article')).toHaveLength(3);
    expect(within(dock).queryByRole('button', { name: /Next waiting item/ })).toBeNull();
  });
});

describe('Ticket page dock: acting in place', () => {
  it('answers a Worker question from the dock', async () => {
    const user = userEvent.setup();
    const { forge } = open([questionView({ options: [] })]);

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    await user.type(
      within(dock).getByRole('textbox', { name: 'Your answer' }),
      'Per account',
    );

    await user.click(within(dock).getByRole('button', { name: 'Send answer' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({
        action: 'answer',
        text: 'Per account',
      }),
    );
  });

  it('approves a sign-off from the dock, only after its confirm, and keeps a one-line record', async () => {
    const user = userEvent.setup();
    const { forge } = open([signOffView('tier_b')], {
      ticketStatus: { 'SVC-4': 'review' },
    });

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    await user.click(within(dock).getByRole('button', { name: 'Approve and merge' }));

    expect(forge.stub.callsTo(ACT)).toHaveLength(0);

    const dialog = await screen.findByRole('alertdialog', { name: 'Approve and merge?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve and merge' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({ action: 'approve' }),
    );

    expect(await screen.findByText(/Approved and merged by you/)).toBeVisible();
  });

  it('acts on finished work that has no escalation through the ticket, not the interaction', async () => {
    const user = userEvent.setup();
    const { forge } = open(
      [],
      { waitActions: { 'SVC-5': ['rework', 'cancel'] } },
      '/p/sample-service/tickets/SVC-5',
    );

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    await user.click(within(dock).getByRole('button', { name: 'Send back for rework' }));
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
});

describe('Ticket page: a hold that is not a dock item', () => {
  it('keeps Cancel reachable outside the dock for a ticket the scheduler holds', async () => {
    open([], { waitActions: { 'SVC-9': ['cancel'] } }, '/p/sample-service/tickets/SVC-9');

    expect(await screen.findByRole('region', { name: 'Waiting' })).toBeVisible();
    expect(screen.queryByRole('button', NO_NEEDS_YOU)).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel ticket' })).toBeEnabled();
  });
});

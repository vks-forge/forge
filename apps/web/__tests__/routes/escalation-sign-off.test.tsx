/**
 * Pins: a sign-off draws as the shared escalation card (the tier in words, what the checks said,
 * why the Director did not sign), asks before it merges, asks tier C for who signs, and shows in all
 * three places: the needs-you modal of the Ticket page (once, instead of the plain wait panel), the
 * card chat and the Inbox drawer; a held ticket gets the Review tab and a banner that leads to it; a
 * settled overrule reads as one line.
 *
 * Why: signing is the last, irreversible step. A sign-off whose tier or checks are hidden, a tier C
 *   with no name asked, or a ticket whose actions appear twice (or not at all) would send the owner
 *   to the wrong decision, or leave finished work with no way forward (d-0135).
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/finished-work-views, routes/ticket/{use-ticket-dock,tabs/review-tab}, routes/card/*,
 *   routes/inbox/*, components/escalation/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld } from '#tests/helpers/escalation-world.js';
import { decisionView, signOffView } from '#tests/helpers/finished-work-views.js';
import {
  dockItem,
  flowEvent,
  flowRoutes,
  FLOW_CARD,
} from '#tests/helpers/flow-fixtures.js';
import { NO_NEEDS_YOU, openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const REVIEW = `${TICKET}/review`;
const INBOX = '/p/sample-service/inbox';
const CARD = `/p/sample-service/cards/${FLOW_CARD}`;
const ACT = 'POST /interactions/:id/act';

function open(
  views: Parameters<typeof escalationWorld>[0],
  options: Parameters<typeof escalationWorld>[1] = {},
  path = REVIEW,
) {
  const world = escalationWorld(views, {
    ticketStatus: { 'SVC-4': 'waiting_human' },
    ...options,
  });

  return { world, ...renderApp({ path, routes: world.routes }) };
}

const bodyOf = (forge: { stub: { callsTo: (p: string) => { body: unknown }[] } }) =>
  forge.stub.callsTo(ACT)[0]?.body;

describe('sign-off', () => {
  it('names the tier in words, what the checks said and why the Director did not sign', async () => {
    open([signOffView('director_declined')], { ticketStatus: { 'SVC-4': 'review' } });
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', {
      name: 'The Director did not sign this off: it is yours',
    });

    expect(within(card).getByText('Moderate risk')).toBeVisible();
    expect(
      within(card).getByText(
        '3 checks passed. 1 medium. 1 held finding overruled by you.',
      ),
    ).toBeVisible();

    expect(within(card).getByText('Why the Director did not sign')).toBeVisible();
    expect(within(card).getByText(/could not be confirmed from the diff/)).toBeVisible();
  });

  it('asks before merging on Approve and posts approve', async () => {
    const user = userEvent.setup();
    const { forge } = open([signOffView('tier_b')], {
      ticketStatus: { 'SVC-4': 'review' },
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Approve and merge' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Approve and merge?' });

    expect(forge.stub.callsTo(ACT)).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Approve and merge' }));

    await waitFor(() => expect(bodyOf(forge)).toEqual({ action: 'approve' }));
    expect(await screen.findByText(/Approved and merged by you/)).toBeVisible();
  });

  it('says tier C is only the owner’s and asks who signs', async () => {
    const user = userEvent.setup();
    const { forge } = open([signOffView('tier_c')], {
      ticketStatus: { 'SVC-4': 'needs_signoff' },
    });

    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', {
      name: 'Needs your sign-off: it touches protected files',
    });

    expect(within(card).getByText('Protected files')).toBeVisible();
    expect(
      within(card).getByText(/signs these off only when every check passed/),
    ).toBeVisible();

    await user.click(within(card).getByRole('button', { name: 'Sign off and merge' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign off and merge?',
    });

    const signer = within(dialog).getByLabelText('Signed off by');

    await user.clear(signer);
    await user.type(signer, 'vikash');
    await user.click(within(dialog).getByRole('button', { name: 'Sign off and merge' }));

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({ action: 'sign_off', signer: 'vikash' }),
    );
  });

  it('offers Send back for rework with a reason, and Cancel after asking', async () => {
    const user = userEvent.setup();
    const { forge } = open([signOffView('tier_b')], {
      ticketStatus: { 'SVC-4': 'review' },
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Send back for rework' }));

    const dialog = await screen.findByRole('dialog', { name: 'Send back for rework' });

    await user.type(
      within(dialog).getByLabelText('What needs to change?'),
      'Handle the empty window',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Send back' }));

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({
        action: 'rework',
        comment: 'Handle the empty window',
      }),
    );
  });
});

describe('Ticket page: a held ticket and a sign-off wait', () => {
  it('gives a held ticket the Review tab, decides in the modal and leads to the evidence from it', async () => {
    const user = userEvent.setup();
    const { router } = open([decisionView('findings_hold')], {}, TICKET);

    expect(await screen.findByRole('tab', { name: 'Review' })).toBeVisible();

    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    expect(within(dock).getAllByRole('button', { name: 'Merge anyway' })).toHaveLength(1);

    await user.click(within(dock).getByRole('button', { name: 'Open the review' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe(REVIEW);
    expect(await screen.findByRole('region', { name: 'Gates' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge anyway' })).toBeNull();
    expect(screen.getByRole('button', NO_NEEDS_YOU)).toBeVisible();
  });

  it('shows a sign-off item in the Review tab instead of the plain wait panel, with the facts below', async () => {
    open([signOffView('tier_b')], {
      ticketStatus: { 'SVC-4': 'review' },
      waitActions: { 'SVC-4': ['approve', 'rework', 'cancel'] },
    });

    await openNeedsYou(userEvent.setup());

    await screen.findByRole('region', { name: 'Ready for your sign-off' });

    expect(screen.getAllByRole('button', { name: 'Approve and merge' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Waiting' })).toBeNull();
  });

  it('keeps the Review tab away from a ticket nothing is held on', async () => {
    open([], {}, TICKET);

    await screen.findByRole('tab', { name: 'Conversation' });

    expect(screen.queryByRole('tab', { name: 'Review' })).toBeNull();
  });
});

describe('the same item in the card chat and the Inbox', () => {
  it('sends the sign-off from the dock to its review and keeps a chat record', async () => {
    const user = userEvent.setup();
    const world = escalationWorld([signOffView('tier_b')]);

    renderApp({
      path: CARD,
      routes: {
        ...flowRoutes({
          detail: {
            needs_you: true,
            column: 'needs_you',
            needs_you_detail: [
              dockItem('ticket_signoff', [], {
                title: 'Ready for your sign-off',
                ticket_id: 'SVC-4',
              }),
            ],
          },
          events: [
            flowEvent(0, 'escalation', {
              interaction_id: 'int-so-tier_b',
              ticket_id: 'SVC-4',
              escalation_kind: 'sign_off',
              title: 'Ready for your sign-off',
            }),
          ],
        }),
        ...world.routes,
      },
    });

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    // Merging is irreversible: the dock sends the owner to the review, never a one-click merge.
    expect(within(dock).queryByRole('button', { name: 'Approve and merge' })).toBeNull();
    expect(within(dock).getByRole('link', { name: 'Open the ticket' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-4/review',
    );

    const chat = screen.getByRole('log', { name: 'Conversation' });
    expect(await within(chat).findByText('Waiting on you')).toBeInTheDocument();
    expect(within(chat).queryByRole('button')).toBeNull();
  });

  it('shows a settled overrule in the chat as one line with the reason from the event', async () => {
    const world = escalationWorld([]);

    renderApp({
      path: CARD,
      routes: {
        ...flowRoutes({
          detail: { needs_you: false },
          events: [
            flowEvent(0, 'escalation_settled', {
              interaction_id: 'int-gone',
              ticket_id: 'SVC-4',
              action: 'merge_anyway',
              by: 'owner',
              comment: 'The nit is intended',
            }),
          ],
        }),
        ...world.routes,
      },
    });

    expect(
      await screen.findByText('Merged anyway by you: The nit is intended'),
    ).toBeVisible();
  });

  it('opens the decision from the Inbox row in the same card', async () => {
    const user = userEvent.setup();
    const world = escalationWorld([decisionView('findings_hold')]);
    const { forge } = renderApp({ path: INBOX, routes: world.routes });

    await user.click(await screen.findByRole('button', { name: /^Respond:/ }));

    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByText('src/window.ts:41')).toBeVisible();

    await user.click(within(drawer).getByRole('button', { name: 'Merge anyway' }));

    const dialogs = await screen.findAllByRole('dialog', { name: 'Merge anyway?' });

    await user.type(
      within(dialogs[0]!).getByLabelText('Why is it fine to merge?'),
      'It is fine',
    );

    await user.click(within(dialogs[0]!).getByText('Merge SVC-4 anyway'));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({
        action: 'merge_anyway',
        comment: 'It is fine',
      }),
    );

    expect(await within(drawer).findByText(/Merged anyway by you/)).toBeVisible();
    expect(within(drawer).getByText(/It is fine/)).toBeVisible();
  });
});

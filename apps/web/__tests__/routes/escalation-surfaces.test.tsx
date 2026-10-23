/**
 * Pins: one escalation is the same item in the needs-you dock, the card chat record and the
 * Inbox; acting in one place settles the others after the project stream says so; the dock counts
 * only what is the owner's and steps through it one item at a time; the Inbox row opens the same
 * card in a drawer and acting there posts the contract body.
 *
 * Why: the owner meets a stuck ticket wherever they happen to be. If acting in the Inbox left the
 *   chat still asking, or the dock counted an item the Director was still handling, they would
 *   answer twice or distrust the screen. These are the cross-screen guarantees.
 * Depends on: the stubbed Forge server and project stream via helpers/render-app,
 *   helpers/escalation-world, helpers/flow-fixtures, routes/card/*, routes/inbox/*,
 *   components/escalation/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  escalationWorld,
  failureView,
  questionView,
} from '#tests/helpers/escalation-world.js';
import {
  dockItem,
  flowDetail,
  flowEvent,
  flowRoutes,
  FLOW_CARD,
} from '#tests/helpers/flow-fixtures.js';
import { NO_NEEDS_YOU, openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const CARD = `/p/sample-service/cards/${FLOW_CARD}`;
const INBOX = '/p/sample-service/inbox';
const ACT = 'POST /interactions/:id/act';

const raised = (seq: number, id: string, ticket: string, title: string) =>
  flowEvent(seq, 'escalation', {
    interaction_id: id,
    ticket_id: ticket,
    escalation_kind: 'question',
    title,
  });

/** The dock item the server lists for an owner-stage escalation. */
const waiting = (id: string, ticket: string, title: string, kind = 'ticket_escalation') =>
  dockItem(kind, ['answer'], { title, ticket_id: ticket, interaction_id: id });

function openCard(
  views: Record<string, unknown>[],
  events: Record<string, unknown>[],
  items: Record<string, unknown>[] = [],
) {
  const world = escalationWorld(views);
  // The card detail lists what waits on the owner; a test ends the wait by emptying this list.
  const listed = { items };
  const app = renderApp({
    path: CARD,
    routes: {
      ...flowRoutes({ detail: { needs_you: true, column: 'needs_you' }, events }),
      'GET /cards/:id': () => ({
        status: 200,
        body: flowDetail({
          needs_you: true,
          column: 'needs_you',
          needs_you_detail: listed.items,
        }),
      }),
      ...world.routes,
    },
  });

  return { world, listed, ...app };
}

describe('Card page: escalations in the modal and the chat record', () => {
  it('shows the live escalation card in the modal at once, and acting there settles it', async () => {
    const user = userEvent.setup();
    const { forge } = openCard(
      [questionView()],
      [raised(0, 'int-q1', 'SVC-4', 'The Worker has a question')],
      [waiting('int-q1', 'SVC-4', 'The Worker has a question')],
    );

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    const card = await within(dock).findByRole('region', {
      name: 'The Worker has a question',
    });

    expect(within(card).getByText(/UTC or the account time zone/)).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Use suggested' }));

    await waitFor(() => expect(forge.stub.callsTo(ACT)).toHaveLength(1));
    expect(within(dock).queryByRole('button', { name: 'Use suggested' })).toBeNull();

    // The chat keeps a one-line record, settled by the same act.
    const chat = screen.getByRole('log', { name: 'Conversation' });

    expect(await within(chat).findByText(/Answered by you/)).toBeInTheDocument();
    expect(within(chat).queryByRole('button')).toBeNull();
  });

  it('lists the owner items in one modal, names their tickets and counts only theirs', async () => {
    const user = userEvent.setup();
    openCard(
      [
        questionView(),
        failureView('retry_cap', { ticket_id: 'SVC-7', ticket_title: 'Backoff' }),
        questionView({
          id: 'int-hidden',
          ticket_id: 'SVC-9',
          stage: 'director',
          escalated_at: undefined,
          actions: [],
        }),
      ],
      [raised(0, 'int-q1', 'SVC-4', 'The Worker has a question')],
      [
        waiting('int-q1', 'SVC-4', 'The Worker has a question'),
        waiting('int-f1', 'SVC-7', 'Stopped: retried too many times'),
      ],
    );

    const dock = await openNeedsYou(user, 'Waiting on you (2)');
    const first = within(dock).getByRole('article', {
      name: 'The Worker has a question',
    });

    const second = within(dock).getByRole('article', {
      name: 'Stopped: retried too many times',
    });

    expect(within(first).getByRole('link', { name: 'Open the ticket' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-4',
    );

    expect(within(second).getByRole('link', { name: 'Open the ticket' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-7',
    );

    // The Director's own item is not the owner's, so it is not counted or listed.
    expect(within(dock).getAllByRole('article')).toHaveLength(2);
  });

  it('shows a Director auto-answer as one quiet line when the owner never saw it', async () => {
    openCard(
      [],
      [
        flowEvent(0, 'escalation_settled', {
          interaction_id: 'int-auto',
          ticket_id: 'SVC-4',
          action: 'answer',
          by: 'director',
        }),
      ],
    );

    expect(await screen.findByText('Answered by the Director')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Tickets waiting on you' })).toBeNull();
  });

  it('settles the chat record and clears the dock when the stream says it was settled elsewhere', async () => {
    const user = userEvent.setup();
    const { world, listed, forge } = openCard(
      [questionView()],
      [raised(0, 'int-q1', 'SVC-4', 'The Worker has a question')],
      [waiting('int-q1', 'SVC-4', 'The Worker has a question')],
    );

    await openNeedsYou(user, 'Waiting on you (1)');
    await waitFor(() => expect(forge.streams.projectSources[0]).toBeDefined());
    const stream = forge.streams.projectSources[0]!;
    stream.open();

    world.settleElsewhere('int-q1', 'answer', 'owner');
    listed.items = [];
    stream.emit('invalidate', { keys: [['card', FLOW_CARD]] });

    expect(await screen.findByText(/Answered by you/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', NO_NEEDS_YOU)).toBeNull());
  });

  it('falls back to a titled line with a ticket link when the item is not in the live list', async () => {
    openCard([], [raised(0, 'int-gone', 'SVC-4', 'The Worker has a question')]);

    const chat = await screen.findByRole('log', { name: 'Conversation' });

    expect(
      await within(chat).findByText('The Worker has a question'),
    ).toBeInTheDocument();

    expect(within(chat).getByRole('link', { name: 'SVC-4' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-4',
    );
  });
});

describe('Inbox: escalations', () => {
  it('opens the escalation card from the row and posts the chosen option', async () => {
    const user = userEvent.setup();
    const world = escalationWorld([questionView()]);
    const { forge } = renderApp({ path: INBOX, routes: world.routes });

    const respond = await screen.findByRole('button', { name: /^Respond:/ });

    await user.click(respond);
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByText(/UTC or the account time zone/)).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Account time zone' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({
        action: 'answer',
        option_id: 'o2',
      }),
    );

    expect(await within(drawer).findByText(/Answered by you/)).toBeInTheDocument();
  });

  it('offers no Respond on an item that carries no escalation', async () => {
    const world = escalationWorld([]);
    renderApp({
      path: INBOX,
      routes: {
        ...world.routes,
        'GET /projects/:slug/inbox': {
          body: {
            items: [
              {
                id: 'ticket_review:SVC-5',
                kind: 'ticket_review',
                project: 'sample-service',
                title: 'SVC-5 is ready for review',
                ticket_id: 'SVC-5',
                needs_action: true,
                updated_at: '2026-10-16T08:00:00.000Z',
                read: false,
                archived: false,
              },
            ],
            nextCursor: null,
          },
        },
      },
    });

    await screen.findByText('SVC-5 is ready for review');

    expect(screen.queryByRole('button', { name: /^Respond:/ })).toBeNull();
  });

  it('opens the right card for each of several items and keeps rows reachable by keyboard', async () => {
    const user = userEvent.setup();
    const world = escalationWorld([
      questionView(),
      failureView('retry_cap', { ticket_id: 'SVC-7', ticket_title: 'Backoff' }),
    ]);

    renderApp({ path: INBOX, routes: world.routes });

    const buttons = await screen.findAllByRole('button', { name: /^Respond:/ });

    expect(buttons).toHaveLength(2);

    buttons[1]!.focus();
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('region', { name: /Stopped: retried too many times/ }),
    ).toBeInTheDocument();
  });
});

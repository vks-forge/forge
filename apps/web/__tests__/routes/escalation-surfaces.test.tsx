/**
 * Pins: one escalation is the same item in the card chat, the Needs-you banner and the Inbox;
 * acting in one place settles the others after the project stream says so; the banner counts only
 * what is the owner's and brings the first card into view; the Inbox row opens the same card in a
 * drawer and acting there posts the contract body.
 *
 * Why: the owner meets a stuck ticket wherever they happen to be. If acting in the Inbox left the
 *   chat still asking, or the banner counted an item the Director was still handling, they would
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
import { flowEvent, flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
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

function openCard(views: Record<string, unknown>[], events: Record<string, unknown>[]) {
  const world = escalationWorld(views);
  const app = renderApp({
    path: CARD,
    routes: {
      ...flowRoutes({ detail: { needs_you: true, column: 'needs_you' }, events }),
      ...world.routes,
    },
  });

  return { world, ...app };
}

describe('Card page: escalations in the chat and the banner', () => {
  it('draws the live escalation card in the chat and acting there settles it', async () => {
    const user = userEvent.setup();
    const { forge } = openCard(
      [questionView()],
      [raised(0, 'int-q1', 'SVC-4', 'The Worker has a question')],
    );

    const chat = await screen.findByRole('log', { name: 'Conversation' });
    const card = await within(chat).findByRole('region', {
      name: 'The Worker has a question',
    });

    expect(within(card).getByText(/UTC or the account time zone/)).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Use suggested' }));

    await waitFor(() => expect(forge.stub.callsTo(ACT)).toHaveLength(1));
    expect(await within(chat).findByText(/Answered by you/)).toBeInTheDocument();
    expect(within(chat).queryByRole('button', { name: 'Use suggested' })).toBeNull();
  });

  it('counts the owner items, names their tickets and focuses the first card', async () => {
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
    );

    const banner = await screen.findByRole('region', { name: 'Tickets waiting on you' });

    expect(within(banner).getByText('2 tickets are waiting on you')).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'SVC-4' })).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'SVC-7' })).toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'SVC-9' })).toBeNull();

    await screen.findByRole('region', { name: 'The Worker has a question' });
    await user.click(within(banner).getByRole('button', { name: 'Show the first' }));

    expect(document.activeElement?.id).toBe('escalation-int-q1');
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

  it('settles the chat and clears the banner when the stream says it was settled elsewhere', async () => {
    const { world, forge } = openCard(
      [questionView()],
      [raised(0, 'int-q1', 'SVC-4', 'The Worker has a question')],
    );

    await screen.findByRole('region', { name: 'Tickets waiting on you' });
    await waitFor(() => expect(forge.streams.projectSources[0]).toBeDefined());
    const stream = forge.streams.projectSources[0]!;
    stream.open();

    world.settleElsewhere('int-q1', 'answer', 'owner');
    stream.emit('invalidate', { keys: [['card', FLOW_CARD]] });

    expect(await screen.findByText(/Answered by you/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Tickets waiting on you' })).toBeNull(),
    );
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

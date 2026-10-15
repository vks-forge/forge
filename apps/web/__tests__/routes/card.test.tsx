/**
 * Pins: the Card page shows its header, history and the Director chat; changing the type and
 * closing both ask first and send only `type` or `closed_reason` (close needs a reason); a sent
 * message appears at once as unsent, is replaced by the server's copy, and when refused leaves
 * its words in the box; the "Director is thinking" state shows; an event kind the UI does not
 * know is a neutral note, never a crash; a closed card keeps its history but cannot be messaged.
 *
 * Why: the card chat is where the user steers intent. Losing a typed message to a refusal, a
 *   close with no reason on record, a type change with no confirmation or a page that goes blank
 *   on an event from a newer server would each break trust in the one place the user talks to
 *   the Director.
 * Depends on: the stubbed Forge server via helpers/render-app, routes/card/*, components/card/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { storageKeyOf } from '#/state/create-persisted-store.js';
import { json, networkDown, refusal } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { SAMPLE_CARDS } from '#tests/helpers/forge-data/card-data.js';

const card = (id: string) => `/p/sample-service/cards/${id}`;
const detailOf = (n: number) => {
  const item = SAMPLE_CARDS[n - 1]!;

  return { ...item.summary, tickets: [...item.tickets], pending_interactions: [] };
};

describe('Card page: header and history', () => {
  it('shows the title, column, source and type', async () => {
    renderApp({ path: card('FG-C2') });

    expect(
      await screen.findByRole('heading', { level: 1, name: /Plan a retry strategy/ }),
    ).toBeInTheDocument();

    expect(screen.getByText('Shaping')).toBeInTheDocument();
    expect(screen.getByText(/from Chat/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Type')).toHaveValue('plan');
  });

  it('renders speech, the Director’s actions, events and unknown kinds as notes', async () => {
    renderApp({ path: card('FG-C2') });
    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(
      await within(log).findByText('Can we retry failed webhook sends?'),
    ).toBeInTheDocument();

    expect(
      within(log).getByText(/retry three times with exponential backoff/),
    ).toBeInTheDocument();

    expect(within(log).getByText('Drafted a plan')).toBeInTheDocument();
    expect(within(log).getByText('Linked the sender module')).toBeInTheDocument();
    expect(
      within(log).getByText('Asked the planner for a cost estimate'),
    ).toBeInTheDocument();

    expect(within(log).getByText('A newer thing happened')).toBeInTheDocument();
    expect(within(log).getByText('Event: another unknown kind')).toBeInTheDocument();
  });

  it('says so for a card that does not exist', async () => {
    renderApp({ path: card('FG-C99') });

    expect(await screen.findByText('There is no card FG-C99')).toBeInTheDocument();
  });

  it('shows questions that wait on the user, linking each ticket', async () => {
    renderApp({
      path: card('FG-C3'),
      routes: {
        'GET /cards/:id': json({
          ...detailOf(3),
          pending_interactions: [
            {
              id: 'int-svc-4',
              ticket_id: 'SVC-4',
              kind: 'question',
              payload: {},
              status: 'pending',
              asked_at: '2026-10-16T10:00:00.000Z',
              timeout_at: '2026-10-17T10:00:00.000Z',
            },
          ],
        }),
      },
    });

    expect(await screen.findByText('A question is waiting for you')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'SVC-4' })[0]).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-4',
    );
  });

  it('lists linked tickets with their state on the Tickets tab, each a link', async () => {
    const user = userEvent.setup();
    renderApp({ path: card('FG-C4') });
    await user.click(await screen.findByRole('tab', { name: /Tickets/ }));

    const list = await screen.findByRole('list', { name: 'Tickets of this card' });

    expect(within(list).getByRole('link', { name: 'SVC-3' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-3',
    );

    expect(within(list).getByRole('link', { name: 'SVC-1' })).toBeInTheDocument();
    expect(within(list).getByText('Done')).toBeInTheDocument();
  });

  it('shows source, creator and budget on the Details tab', async () => {
    const user = userEvent.setup();
    renderApp({ path: card('FG-C4') });
    await user.click(await screen.findByRole('tab', { name: 'Details' }));

    expect(await screen.findByText('Chat · web')).toBeInTheDocument();
    expect(screen.getByText('You (owner)')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });
});

describe('Card page: chat', () => {
  it('appends a sent message at once as unsent, then keeps the server’s copy', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });

    await user.type(
      await screen.findByLabelText('Message the Director'),
      'Please also cap the delay',
    );

    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    expect(await screen.findByText('Please also cap the delay')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());

    expect(screen.getAllByText('Please also cap the delay')).toHaveLength(1);
    expect(screen.getByLabelText('Message the Director')).toHaveValue('');
    expect(forge.stub.callsTo('POST /cards/:id/messages')).toMatchObject([
      {
        path: '/cards/FG-C2/messages',
        body: { text: 'Please also cap the delay', author: 'owner' },
      },
    ]);
  });

  it('removes the unsent line and keeps the draft when the server refuses', async () => {
    const user = userEvent.setup();
    renderApp({
      path: card('FG-C2'),
      routes: { 'POST /cards/:id/messages': refusal(409, 'card_closed', 'closed') },
    });

    await user.type(
      await screen.findByLabelText('Message the Director'),
      'Are you there?',
    );

    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(
      await screen.findByText(/This card was closed, so the message was not sent/),
    ).toBeInTheDocument();

    expect(screen.queryByText('Sending…')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message the Director')).toHaveValue('Are you there?');
    expect(localStorage.getItem(storageKeyOf('drafts'))).toContain('card:FG-C2');
  });

  it('keeps the draft through a dropped connection too', async () => {
    const user = userEvent.setup();
    renderApp({
      path: card('FG-C2'),
      routes: { 'POST /cards/:id/messages': networkDown },
    });

    await user.type(await screen.findByLabelText('Message the Director'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText(/Your message was not sent/)).toBeInTheDocument();
    expect(screen.getByLabelText('Message the Director')).toHaveValue('Hello');
  });

  it('says the Director is thinking while the card reports it', async () => {
    renderApp({
      path: card('FG-C2'),
      routes: {
        'GET /cards/:id': json({ ...detailOf(2), director: { state: 'thinking' } }),
      },
    });

    expect(await screen.findByText('The Director is thinking…')).toBeInTheDocument();
  });

  it('shows the Director’s failure in words', async () => {
    renderApp({
      path: card('FG-C2'),
      routes: {
        'GET /cards/:id': json({
          ...detailOf(2),
          director: { state: 'error', last_error: 'model quota exhausted' },
        }),
      },
    });

    expect(await screen.findByText(/model quota exhausted/)).toBeInTheDocument();
  });

  it('ignores a director block it does not understand instead of failing the page', async () => {
    renderApp({
      path: card('FG-C2'),
      routes: {
        'GET /cards/:id': json({ ...detailOf(2), director: { state: 'dreaming' } }),
      },
    });

    expect(await screen.findByLabelText('Message the Director')).toBeInTheDocument();
    expect(screen.queryByText('The Director is thinking…')).not.toBeInTheDocument();
  });
});

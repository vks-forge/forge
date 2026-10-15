/**
 * Pins: the card chat reads history in windows (newest page first, "load older" below the
 * oldest held, polls only after the newest held); a Director action line says done or refused
 * with its summary; a close suggestion offers a "Close card" shortcut that opens the existing
 * close dialog with the Director's reason prefilled; and an unknown kind is still a note.
 *
 * Why: a long conversation must not cost a full re-read on every poll, and the Director's
 *   suggestion to close is only useful if acting on it takes one click and still asks first.
 * Depends on: the stubbed Forge server via helpers/render-app, routes/card/*, api/use-card.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '#tests/helpers/render-app.js';

const card = (id: string) => `/p/sample-service/cards/${id}`;
const eventCalls = (stub: { callsTo: (p: string) => { path: string }[] }) =>
  stub.callsTo('GET /cards/:id/events').map((call) => call.path);

describe('Card chat: windows', () => {
  it('reads the newest page first, then older pages below the oldest held', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C5') });
    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText('Note number 119')).toBeInTheDocument();
    expect(within(log).getByText('Note number 70')).toBeInTheDocument();
    expect(within(log).queryByText('Note number 69')).not.toBeInTheDocument();
    expect(eventCalls(forge.stub)[0]).toBe('/cards/FG-C5/events?order=desc&limit=50');

    await user.click(within(log).getByRole('button', { name: 'Show earlier messages' }));

    expect(await within(log).findByText('Note number 69')).toBeInTheDocument();
    expect(within(log).getByText('Note number 20')).toBeInTheDocument();
    expect(eventCalls(forge.stub)).toContain('/cards/FG-C5/events?before=70&limit=50');
  });

  it('offers no earlier page when the whole history fits one window', async () => {
    renderApp({ path: card('FG-C2') });
    await screen.findByText('Can we retry failed webhook sends?');

    expect(
      screen.queryByRole('button', { name: 'Show earlier messages' }),
    ).not.toBeInTheDocument();
  });

  it('asks only for events after the newest one held when it refreshes', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });
    await user.type(await screen.findByLabelText('Message the Director'), 'Hello again');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(eventCalls(forge.stub).some((path) => path.includes('after=6'))).toBe(true),
    );

    expect(
      eventCalls(forge.stub).filter((path) => path.includes('order=desc')),
    ).toHaveLength(1);
  });
});

describe('Card chat: Director actions and close suggestions', () => {
  it('says whether each action was done or refused, with its summary', async () => {
    renderApp({ path: card('FG-C2') });
    const log = await screen.findByRole('log', { name: 'Conversation' });
    const actions = within(
      await within(log).findByRole('list', { name: 'What the Director did' }),
    );

    expect(actions.getByText('Done')).toBeInTheDocument();
    expect(actions.getByText('Drafted a plan')).toBeInTheDocument();
    expect(actions.getByText('Refused')).toBeInTheDocument();
    expect(actions.getByText('Type change refused')).toBeInTheDocument();
    expect(
      within(log).getByText('Asked the planner for a cost estimate'),
    ).toBeInTheDocument();

    expect(within(log).getAllByText('Done')).toHaveLength(2);
  });

  it('opens the close dialog with the Director’s reason prefilled, and still asks first', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });
    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(
      await within(log).findByText(/The Director suggests closing this card/),
    ).toBeInTheDocument();

    await user.click(within(log).getByRole('button', { name: 'Close card' }));
    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByLabelText(/Reason/)).toHaveValue(
      'The plan was folded into FG-C4',
    );

    expect(forge.stub.callsTo('PATCH /cards/:id')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Close card' }));

    expect(await screen.findByText('Closed.')).toBeInTheDocument();
    expect(forge.stub.callsTo('PATCH /cards/:id')).toMatchObject([
      { body: { closed_reason: 'The plan was folded into FG-C4' } },
    ]);
  });

  it('keeps unknown kinds as notes', async () => {
    renderApp({ path: card('FG-C2') });
    const log = await screen.findByRole('log', { name: 'Conversation' });

    expect(await within(log).findByText('A newer thing happened')).toBeInTheDocument();
  });
});

/**
 * Pins: changing a card's type and closing it both ask first and send only `type` or
 * `closed_reason`; closing needs a reason, which is then shown; a refused change explains itself
 * and leaves the card as it was; a closed card keeps its history but takes no message.
 *
 * Why: both edits are consequential and neither can be undone from the page. A type change with
 *   no confirmation, or a close with no reason on record, would silently change how the Director
 *   treats a request and leave nobody able to say why.
 * Depends on: the stubbed Forge server via helpers/render-app, routes/card/card-header.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose, chosen } from '#tests/helpers/choose.js';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';

const card = (id: string) => `/p/sample-service/cards/${id}`;

describe('Card page: type and close', () => {
  it('asks before changing the type and sends only the type', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });

    await choose(user, 'Type', 'Issue');
    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByText('Change the type to Issue?')).toBeInTheDocument();
    expect(forge.stub.callsTo('PATCH /cards/:id')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Change type' }));

    await waitFor(() => expect(chosen('Type')).toBe('Issue'));
    expect(forge.stub.callsTo('PATCH /cards/:id')).toMatchObject([
      { path: '/cards/FG-C2', body: { type: 'issue' } },
    ]);
  });

  it('leaves the type alone when the change is cancelled', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });

    await choose(user, 'Type', 'Issue');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(chosen('Type')).toBe('Plan');
    expect(forge.stub.callsTo('PATCH /cards/:id')).toHaveLength(0);
  });

  it('explains a refused type change and keeps the card as it was', async () => {
    const user = userEvent.setup();
    renderApp({
      path: card('FG-C2'),
      routes: { 'PATCH /cards/:id': refusal(409, 'card_type_source', 'source') },
    });

    await choose(user, 'Type', 'PR issue');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Change type',
      }),
    );

    expect(
      await screen.findByText(/does not accept this card’s source/),
    ).toBeInTheDocument();

    expect(chosen('Type')).toBe('Plan');
  });

  it('requires a reason to close, then shows it and disables the chat', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });

    await user.click(await screen.findByRole('button', { name: 'Close card' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Close card' });

    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Reason/), 'Superseded by FG-C4');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(await screen.findByText('Closed.')).toBeInTheDocument();
    expect(screen.getByText('Superseded by FG-C4')).toBeInTheDocument();
    expect(forge.stub.callsTo('PATCH /cards/:id')).toMatchObject([
      { body: { closed_reason: 'Superseded by FG-C4' } },
    ]);

    expect(screen.getByLabelText('Message the Director')).toBeDisabled();
  });

  it('keeps a closed card’s history readable but takes no message, and says why', async () => {
    renderApp({ path: card('FG-C6') });

    expect(await screen.findByText('Closed.')).toBeInTheDocument();
    expect(screen.getByLabelText('Message the Director')).toBeDisabled();
    expect(
      screen.getByText(/The Director takes no more messages on it/),
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Close card' })).not.toBeInTheDocument();
  });
});

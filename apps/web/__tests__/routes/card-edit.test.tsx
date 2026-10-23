/**
 * Pins: changing a card's type and closing it both ask first and send only `type` or
 * `closed_reason`; closing needs a reason, which is then shown; a refused change explains itself
 * and leaves the card as it was; a closed card keeps its history but takes no message.
 *
 * Why: both edits are consequential and neither can be undone from the page. A type change with
 *   no confirmation, or a close with no reason on record, would silently change how the Director
 *   treats a request and leave nobody able to say why.
 * Depends on: the stubbed Forge server via helpers/render-app, routes/card/card-header,
 *   components/work/header-menu.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';

const card = (id: string) => `/p/sample-service/cards/${id}`;

type User = ReturnType<typeof userEvent.setup>;

/** Opens the header's `⋯` menu and picks one row by its name. */
async function fromMenu(user: User, name: string): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Card actions' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

/** Whether the menu row for this type is the checked, unselectable current one. */
async function isCurrentType(user: User, name: string): Promise<boolean> {
  await user.click(await screen.findByRole('button', { name: 'Card actions' }));
  const row = await screen.findByRole('menuitem', { name });
  const current = row.getAttribute('aria-disabled') === 'true';
  await user.keyboard('{Escape}');

  return current;
}

describe('Card page: type and close', () => {
  it('asks before changing the type and sends only the type', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });

    await fromMenu(user, 'Issue');
    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByText('Change the type to Issue?')).toBeInTheDocument();
    expect(forge.stub.callsTo('PATCH /cards/:id')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Change type' }));

    await waitFor(async () => expect(await isCurrentType(user, 'Issue')).toBe(true));
    expect(forge.stub.callsTo('PATCH /cards/:id')).toMatchObject([
      { path: '/cards/FG-C2', body: { type: 'issue' } },
    ]);
  });

  it('leaves the type alone when the change is cancelled', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });

    await fromMenu(user, 'Issue');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(await isCurrentType(user, 'Plan')).toBe(true);
    expect(forge.stub.callsTo('PATCH /cards/:id')).toHaveLength(0);
  });

  it('explains a refused type change and keeps the card as it was', async () => {
    const user = userEvent.setup();
    renderApp({
      path: card('FG-C2'),
      routes: { 'PATCH /cards/:id': refusal(409, 'card_type_source', 'source') },
    });

    await fromMenu(user, 'PR issue');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Change type',
      }),
    );

    expect(
      await screen.findByText(/does not accept this card’s source/),
    ).toBeInTheDocument();

    expect(await isCurrentType(user, 'Plan')).toBe(true);
  });

  it('requires a reason to close, then shows it and disables the chat', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: card('FG-C2') });

    await fromMenu(user, 'Close card…');
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Close card' });

    // It says what closing really does: Workers stop, unfinished tickets are cancelled.
    expect(dialog).toHaveTextContent(
      /stops any running Worker and cancels this card.s unfinished tickets/,
    );

    expect(dialog).not.toHaveTextContent(/keep running/);
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

    // A closed card takes no change, so its menu is gone.
    expect(
      screen.queryByRole('button', { name: 'Card actions' }),
    ).not.toBeInTheDocument();
  });
});

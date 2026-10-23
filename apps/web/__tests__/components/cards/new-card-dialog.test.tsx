/**
 * Pins: the New card popup keeps Create disabled until the card is valid and says what is
 * missing once a field is left; on success it closes, says which card was created and opens
 * that card page, where the Director's reading shows; leaving with text asks first; Ctrl+Enter
 * sends a valid card.
 *
 * Why: the Director starts planning the moment a card exists. A thin card wastes its first
 *   questions, and a popup that lets typed text vanish or hides what happened after Create
 *   breaks trust at the one place work enters Forge.
 * Depends on: the stubbed Forge server via helpers/render-app, components/cards/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  BOARD,
  CREATE,
  UUID,
  createButton,
  fill,
  openPopup,
} from '#tests/helpers/new-card-popup.js';
import { locationOf, renderApp } from '#tests/helpers/render-app.js';

describe('New card popup', () => {
  it('keeps Create disabled until the card is valid and names what is missing', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await openPopup(user);

    expect(createButton()).toBeDisabled();
    // Nothing is shouted at the user before they have touched a field.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Title'), 'ab');
    await user.tab();
    expect(screen.getByText(/title of at least 4 characters/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Description'), 'too short');
    await user.tab();
    expect(screen.getByText(/at least 20 characters \(now 9\)/)).toBeInTheDocument();
    expect(createButton()).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), 'cd');
    await user.type(screen.getByLabelText('Description'), ' and now it says enough');

    expect(screen.queryByText(/title of at least/)).not.toBeInTheDocument();
    expect(createButton()).toBeEnabled();
  });

  it('says the 20-character minimum up front, counts up while typing, and ties the disabled Create to it', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await openPopup(user);

    const hint = screen.getByText(
      /At least 20 characters, so the Director has something/,
    );

    expect(hint).toHaveTextContent('0 of 20 so far');
    expect(createButton()).toHaveAttribute('aria-describedby', hint.id);

    await user.type(screen.getByLabelText('Description'), 'seven c');
    expect(hint).toHaveTextContent('7 of 20 so far');

    await user.type(screen.getByLabelText('Description'), 'haracters and more');
    expect(hint).not.toHaveTextContent('so far');
  });

  it('refuses a title over 120 characters', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await openPopup(user);

    await user.click(screen.getByLabelText('Title'));
    await user.paste('x'.repeat(121));
    await user.tab();

    expect(screen.getByText(/120 characters or fewer \(now 121\)/)).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it('creates the card, closes, says which card it is and opens its page', async () => {
    const user = userEvent.setup();
    const { router, forge } = renderApp({ path: BOARD });
    await openPopup(user);
    await fill(user);

    await user.click(createButton());

    await waitFor(() => expect(locationOf(router)).toBe('/p/sample-service/cards/FG-C7'));

    expect(await screen.findByText('Card FG-C7 created')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'New card' })).not.toBeInTheDocument();

    const [call] = forge.stub.callsTo(CREATE);
    expect(call?.body).toEqual({
      title: 'Retry failed webhooks',
      description: 'Failed webhook sends should retry with backoff, three times.',
      type: 'plan',
      priority: 'normal',
      depends_on: [],
      blocks: [],
      links: [],
      dedupe_key: expect.stringMatching(UUID),
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Retry failed webhooks' }),
    ).toBeInTheDocument();

    // The Director has said nothing yet: the page says it is reading, not that it is idle.
    expect(
      await screen.findByText('Director is reading the project…'),
    ).toBeInTheDocument();
  });

  it('asks before throwing typed text away, and leaves cleanly when nothing was typed', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await openPopup(user);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New card' })).not.toBeInTheDocument(),
    );

    await openPopup(user);
    await user.type(screen.getByLabelText('Title'), 'Half a thought');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    const ask = await screen.findByRole('alertdialog', { name: 'Discard this card?' });
    await user.click(within(ask).getByRole('button', { name: 'Discard' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New card' })).not.toBeInTheDocument(),
    );

    // The next opening starts empty.
    await openPopup(user);
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('sends with Ctrl+Enter from the description once the card is valid', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: BOARD });
    await openPopup(user);
    await fill(user);

    await user.type(screen.getByLabelText('Description'), '{Control>}{Enter}{/Control}');

    await waitFor(() => expect(forge.stub.callsTo(CREATE)).toHaveLength(1));
  });
});

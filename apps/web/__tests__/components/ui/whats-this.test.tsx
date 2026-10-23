/**
 * Pins: the "what's this" button opens a plain explanation on click and on Enter, names its
 * term in its accessible name, and Esc closes it and returns focus to the button.
 *
 * Why: a hover-only hint cannot be reached by touch or reliably by keyboard; the owner who meets
 *   an unfamiliar word must be able to ask what it means with whatever input they have.
 * Depends on: components/ui/whats-this, domain/plain-words.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WhatsThis } from '#/components/ui/whats-this.js';
import { TERM } from '#/domain/plain-words.js';

describe('WhatsThis', () => {
  it('names the term in the button and shows nothing until asked', () => {
    render(<WhatsThis term="check" />);

    expect(
      screen.getByRole('button', { name: 'What is Independent check?' }),
    ).toBeInTheDocument();

    expect(screen.queryByText(TERM.check.explain)).not.toBeInTheDocument();
  });

  it('opens the explanation on click', async () => {
    const user = userEvent.setup();
    render(<WhatsThis term="check" />);

    await user.click(screen.getByRole('button', { name: /What is/ }));

    expect(await screen.findByText(TERM.check.explain)).toBeVisible();
  });

  it('opens on Enter', async () => {
    const user = userEvent.setup();
    render(<WhatsThis term="care" />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(await screen.findByText(/How much checking a ticket gets/)).toBeVisible();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<WhatsThis term="cache" />);
    const button = screen.getByRole('button', { name: /What is/ });

    await user.click(button);
    await screen.findByText(TERM.cache.explain);
    await user.keyboard('{Escape}');

    expect(screen.queryByText(TERM.cache.explain)).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});

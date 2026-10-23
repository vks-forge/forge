/**
 * Pins: the Ticket page frame by width. The header is one row (id, title, one status pill, cost);
 * from 1280 px the Worker thread is the main column with Review, Runs and Details in a rail
 * beside it (no Conversation tab; the rail opens on the review while one waits and an explicit
 * tab in the address wins) and the alert stays under the title; from 1024 to 1279 px the same
 * views are tabs above the thread; below 1024 px the thread is the page and the views open as a
 * full-screen sheet that Esc or "Back to chat" closes.
 *
 * Why: the owner could not read the Worker thread and decide at once, and a stack of banners
 *   left it no room (d-0172). Each breakpoint is a different tree with different focus rules, so
 *   each needs its own pin: a sheet that cannot be closed from the keyboard, or a rail that
 *   unmounts the thread, would each undo the redesign.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/match-media,
 *   components/work/*, routes/ticket/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setMatchMedia } from '#tests/helpers/match-media.js';
import { NO_NEEDS_YOU, openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = '/p/sample-service/tickets/SVC-5';
const RAIL = (query: string): boolean => query.includes('min-width: 1280px');
const SHEET = (query: string): boolean => query.includes('max-width: 1023px');

describe('Ticket page: layout by width', () => {
  it('keeps the header to one row: id, title, one status pill and the cost', async () => {
    renderApp({ path: PAGE });

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('SVC-5')).toBeInTheDocument();
    expect(screen.getByText('Needs you')).toBeInTheDocument();
    expect(screen.getByText(/Cost of this ticket/)).toBeInTheDocument();
  });

  describe('from 1280 px: the rail', () => {
    it('shows the thread and the review side by side, with no Conversation tab', async () => {
      setMatchMedia(RAIL);
      renderApp({ path: PAGE });

      const rail = await screen.findByRole('complementary', { name: 'Runs and details' });
      const strip = within(rail).getByRole('tablist', { name: 'Ticket' });

      expect(
        within(strip)
          .getAllByRole('tab')
          .map((tab) => tab.textContent),
      ).toEqual(['Review', 'Runs', 'History', 'Details']);

      expect(screen.getByRole('log', { name: 'Worker messages' })).toBeInTheDocument();
      expect(
        await within(rail).findByRole('region', { name: 'Gates' }),
      ).toBeInTheDocument();
    });

    it('keeps the decision behind one alert only, not a second time in the rail', async () => {
      const user = userEvent.setup();
      setMatchMedia(RAIL);
      renderApp({ path: PAGE });

      await screen.findByRole('complementary', { name: 'Runs and details' });

      expect(await screen.findAllByRole('button', NO_NEEDS_YOU)).toHaveLength(1);

      await openNeedsYou(user);

      expect(screen.getAllByRole('region', { name: /Waiting on you/ })).toHaveLength(1);
    });

    it('opens on the runs when nothing waits on a review', async () => {
      setMatchMedia(RAIL);
      renderApp({ path: '/p/sample-service/tickets/SVC-1' });

      const rail = await screen.findByRole('complementary', { name: 'Runs and details' });

      expect(
        await within(rail).findByRole('region', { name: 'Runs' }),
      ).toBeInTheDocument();
    });

    it('lets an explicit tab in the address win over the default', async () => {
      setMatchMedia(RAIL);
      renderApp({ path: `${PAGE}/details` });

      const rail = await screen.findByRole('complementary', { name: 'Runs and details' });

      expect(
        await within(rail).findByRole('region', { name: 'Cost' }),
      ).toBeInTheDocument();

      expect(screen.getByRole('log', { name: 'Worker messages' })).toBeInTheDocument();
    });
  });

  describe('from 1024 to 1279 px: tabs above the thread', () => {
    it('keeps the Conversation as the first tab, with the alert under the title', async () => {
      const user = userEvent.setup();
      renderApp({ path: PAGE });

      const strip = await screen.findByRole('tablist', { name: 'Ticket' });

      expect(within(strip).getAllByRole('tab')[0]).toHaveTextContent('Conversation');
      expect(
        screen.queryByRole('complementary', { name: 'Runs and details' }),
      ).toBeNull();

      expect(await openNeedsYou(user, 'Waiting on you (1)')).toBeVisible();
    });
  });

  describe('below 1024 px: the sheet', () => {
    it('shows only the thread until the header button opens the views as a sheet', async () => {
      setMatchMedia(SHEET);
      const user = userEvent.setup();
      const { router } = renderApp({ path: PAGE });

      expect(
        await screen.findByRole('log', { name: 'Worker messages' }),
      ).toBeInTheDocument();

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('tablist', { name: 'Ticket' })).toBeNull();

      await user.click(screen.getByRole('link', { name: 'Runs and details' }));

      const sheet = await screen.findByRole('dialog');

      expect(router.state.location.pathname).toBe(`${PAGE}/review`);
      expect(
        within(sheet).getByRole('button', { name: /Back to chat/ }),
      ).toBeInTheDocument();
    });

    it('closes with Escape and returns to the thread', async () => {
      setMatchMedia(SHEET);
      const user = userEvent.setup();
      const { router } = renderApp({ path: `${PAGE}/runs` });

      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(router.state.location.pathname).toBe(`${PAGE}/conversation`);
      expect(screen.getByRole('log', { name: 'Worker messages' })).toBeInTheDocument();
    });
  });
});

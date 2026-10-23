/**
 * Pins: the Card page's History tab. It sits between Tickets and Details and opens from
 * `/cards/:id/history`; the card's own phases show with one roll-up line per ticket event, and a
 * roll-up line links to that ticket's History tab; a card-level question links to the
 * conversation; the project stream's `["card", id]` key refreshes the open tab; and a card with
 * no history says so.
 *
 * Why: the owner asks "where did this card get to?" before asking about any one ticket. The
 * roll-up lines are only useful if one click lands on the ticket's own story, and the tab must
 * not go stale while tickets move.
 * Depends on: routes/card/tabs/history-tab, components/history/*, the stubbed Forge server.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { pagedHistory } from '#tests/helpers/fake-forge/history-routes.js';
import { flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
import { cardHistoryEntries } from '#tests/helpers/forge-data/history-data.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;
const HISTORY = `GET /cards/${FLOW_CARD}/history`;

describe('Card History tab', () => {
  it('is a tab between Tickets and Details and opens from the strip', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: PAGE, routes: flowRoutes() });

    const strip = await screen.findByRole('tablist', { name: 'Card' });
    const names = within(strip)
      .getAllByRole('tab')
      .map((tab) => tab.textContent?.replace(/\d+$/, ''));

    expect(names).toEqual(['Conversation', 'Plan', 'Tickets', 'History', 'Details']);

    await user.click(screen.getByRole('tab', { name: 'History' }));

    expect(router.state.location.pathname).toBe(`${PAGE}/history`);
    expect(await screen.findByRole('region', { name: 'History' })).toBeInTheDocument();
  });

  it('shows roll-up lines that link to the ticket history, and a question that links to the chat', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: `${PAGE}/history`, routes: flowRoutes() });
    await screen.findByRole('region', { name: 'History' });

    expect(screen.getByText('Plan ready for your review')).toBeInTheDocument();

    const rollUp = screen.getByText('SVC-1: moved to In progress').closest('li')!;
    const link = within(rollUp).getByRole('link', { name: 'Open SVC-1 history' });
    expect(link).toHaveAttribute('href', '/p/sample-service/tickets/SVC-1/history');

    const question = screen.getByText('Asked you which lane to use').closest('li')!;
    expect(within(question).getByRole('link', { name: 'Open question' })).toHaveAttribute(
      'href',
      `${PAGE}/conversation`,
    );

    await user.click(link);
    expect(router.state.location.pathname).toBe(
      '/p/sample-service/tickets/SVC-1/history',
    );
  });

  it('says nothing has happened yet when the card has no history', async () => {
    renderApp({
      path: `${PAGE}/history`,
      routes: { ...flowRoutes(), [HISTORY]: pagedHistory([]) },
    });

    expect(await screen.findByText('Nothing has happened yet')).toBeInTheDocument();
  });

  it('refetches when the project stream names this card', async () => {
    const entries = cardHistoryEntries();
    let served = entries.slice(0, 1);
    const { forge } = renderApp({
      path: `${PAGE}/history`,
      routes: { ...flowRoutes(), [HISTORY]: (request) => pagedHistory(served)(request) },
    });

    await screen.findByText('Plan ready for your review');
    expect(screen.queryByText('Asked you which lane to use')).not.toBeInTheDocument();

    await waitFor(() => expect(forge.streams.projectSources[0]).toBeDefined());
    const stream = forge.streams.projectSources[0]!;
    stream.open();
    served = entries;
    stream.emit('invalidate', { keys: [['card', FLOW_CARD]] });

    expect(await screen.findByText('Asked you which lane to use')).toBeInTheDocument();
  });
});

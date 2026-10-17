/**
 * Pins: the Card page's tab is a path segment. `/cards/:id` opens Conversation, an unknown tab
 * replaces itself with it, a deep link opens its tab, Back and Forward step through views, an
 * old `?tab=` link still works, the composer stays in the tab (outside the scrolling list), and
 * cost shows small in the header with the Director / tickets split, and in full on Details.
 *
 * Why: owners link to a card's plan or tickets, reload, and press Back; a tab that lives only
 *   in component state loses all three. The cost lines are the honesty contract of the page: a
 *   total with a split, "not recorded" never shown as free.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   routes/card/*.
 */

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { ticketSummary } from '#tests/helpers/work-fixtures.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;

const names = (strip: HTMLElement): string[] =>
  within(strip)
    .getAllByRole('tab')
    .map((tab) => tab.textContent?.replace(/\d+$/, '') ?? '');

describe('Card page tabs in the URL', () => {
  it('opens Conversation by default, with Conversation, Plan, Tickets, Details in order', async () => {
    renderApp({ path: PAGE, routes: flowRoutes() });

    const strip = await screen.findByRole('tablist', { name: 'Card' });

    expect(names(strip)).toEqual(['Conversation', 'Plan', 'Tickets', 'Details']);
    expect(screen.getByRole('tab', { name: 'Conversation' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    expect(await screen.findByRole('log', { name: 'Conversation' })).toBeInTheDocument();
  });

  it('replaces an unknown tab with the conversation instead of showing an empty panel', async () => {
    const { router } = renderApp({ path: `${PAGE}/nonsense`, routes: flowRoutes() });

    expect(await screen.findByRole('log', { name: 'Conversation' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`${PAGE}/conversation`);
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('opens the tab a deep link names', async () => {
    renderApp({ path: `${PAGE}/details`, routes: flowRoutes() });

    expect(await screen.findByRole('region', { name: 'Cost' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    expect(screen.queryByRole('log', { name: 'Conversation' })).not.toBeInTheDocument();
  });

  it('steps back and forward through the tabs that were opened', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: PAGE, routes: flowRoutes() });
    await screen.findByRole('log', { name: 'Conversation' });

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await user.click(screen.getByRole('tab', { name: /Tickets/ }));
    expect(router.state.location.pathname).toBe(`${PAGE}/tickets`);

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe(`${PAGE}/details`);
    expect(await screen.findByRole('region', { name: 'Cost' })).toBeInTheDocument();

    await act(() => router.navigate(1));
    expect(router.state.location.pathname).toBe(`${PAGE}/tickets`);

    await act(() => router.navigate(-2));
    expect(await screen.findByRole('log', { name: 'Conversation' })).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: PAGE, routes: flowRoutes() });
    await screen.findByRole('log', { name: 'Conversation' });

    screen.getByRole('tab', { name: 'Conversation' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(router.state.location.pathname).toBe(`${PAGE}/plan`);
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveFocus();
  });

  it('maps an old ?tab= link to its tab', async () => {
    const { router } = renderApp({ path: `${PAGE}?tab=chat`, routes: flowRoutes() });

    expect(await screen.findByRole('log', { name: 'Conversation' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`${PAGE}/conversation`);
    expect(router.state.location.search).toBe('');
  });
});

describe('Card page chat layout', () => {
  it('keeps the composer in the tab, outside the scrolling message list, with a long history', async () => {
    const events = Array.from({ length: 60 }, (_, i) => ({
      seq: i + 1,
      kind: i % 2 === 0 ? 'user_message' : 'director_message',
      at: new Date(Date.now() - (60 - i) * 60_000).toISOString(),
      actor: { type: i % 2 === 0 ? 'user' : 'director', id: 'x' },
      payload: { text: `line ${i + 1}` },
    }));

    renderApp({ path: PAGE, routes: flowRoutes({ events }) });

    const log = await screen.findByRole('log', { name: 'Conversation' });
    const box = await screen.findByLabelText('Message the Director');

    expect(log).not.toContainElement(box);
    expect(within(log).getAllByText(/^line \d+$/).length).toBeGreaterThan(30);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
  });

  it('shows the author and time once per group and a day label', async () => {
    const base = Date.now() - 3 * 60_000;
    const events = [0, 1, 2].map((i) => ({
      seq: i + 1,
      kind: 'user_message',
      at: new Date(base + i * 30_000).toISOString(),
      actor: { type: 'user', id: 'owner' },
      payload: { text: `note ${i + 1}` },
    }));

    renderApp({ path: PAGE, routes: flowRoutes({ events }) });
    const log = await screen.findByRole('log', { name: 'Conversation' });
    await within(log).findByText('note 3');

    expect(within(log).getAllByText('You')).toHaveLength(1);
    expect(within(log).getAllByRole('separator')).toHaveLength(1);
  });
});

describe('Card page cost', () => {
  const cost = {
    director_usd: 0.41,
    tickets_usd: 1.2,
    total_usd: 1.61,
    by_ticket: [
      { ticket_id: 'SVC-3', title: 'Stream large CSV', usd: 1.2 },
      { ticket_id: 'SVC-4', title: 'Add retry', usd: 0 },
    ],
  };

  const detail = {
    cost,
    cost_usd: 1.61,
    ticket_count: 2,
    tickets: [
      ticketSummary({ id: 'SVC-3' as never, cost_usd: 1.2 }),
      ticketSummary({ id: 'SVC-4' as never, title: 'Add retry', cost_usd: 0 }),
    ],
  };

  it('shows the total small in the header and splits it on focus', async () => {
    renderApp({ path: PAGE, routes: flowRoutes({ detail }) });

    expect(await screen.findByText('$1.61')).toBeInTheDocument();
    expect(screen.getByText(/Cost of this card: \$1\.61/)).toBeInTheDocument();

    await act(async () => screen.getByText('$1.61').parentElement?.focus());
    const tip = await screen.findByRole('tooltip');

    expect(tip).toHaveTextContent('Director');
    expect(tip).toHaveTextContent('$0.41');
    expect(tip).toHaveTextContent('$1.20');
  });

  it('breaks the cost down on Details: Director, each ticket, total', async () => {
    renderApp({ path: `${PAGE}/details`, routes: flowRoutes({ detail }) });

    const table = await screen.findByRole('table', { name: 'Cost of this card' });
    const rows = within(table).getAllByRole('row');

    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Cost'),
      expect.stringContaining('Director'),
      expect.stringContaining('SVC-3'),
      expect.stringContaining('SVC-4'),
      expect.stringContaining('Total'),
    ]);

    expect(within(table).getAllByText('$1.61').length).toBeGreaterThan(0);
  });

  it('shows each ticket cost on the Tickets tab', async () => {
    renderApp({ path: `${PAGE}/tickets`, routes: flowRoutes({ detail }) });

    const list = await screen.findByRole('list', { name: 'Tickets of this card' });

    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(within(list).getByText('$1.20')).toBeInTheDocument();
  });

  it('says the server sent no cost instead of showing zeros', async () => {
    renderApp({ path: `${PAGE}/details`, routes: flowRoutes() });

    expect(await screen.findByText(/did not send a cost/)).toBeInTheDocument();
  });
});

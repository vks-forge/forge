/**
 * Pins: the Tickets screen lists a project's tickets, links each row to its card and ticket,
 * shows a dash for a missing cost, and has its own loading, empty, no-match and error states.
 *
 * Why: this is how the owner finds one ticket among hundreds and sees what it cost. A missing
 * cost read as $0.00 would make the owner believe a ticket was free, and a blank page on an
 * error or an empty filter would leave them guessing whether Forge is broken.
 * Depends on: routes/tickets/*, api/use-tickets-table, helpers/render-work, helpers/tickets-table-world.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { renderWork } from '#tests/helpers/render-work.js';
import {
  LIST,
  lastQuery,
  PAGE,
  rowsOf,
  ticketRows,
  ticketsTableRoute,
  world,
} from '#tests/helpers/tickets-table-world.js';

describe('Tickets list', () => {
  it('has a Tickets entry in the project sidebar, after Board', async () => {
    renderWork(PAGE, world());

    const nav = await screen.findByRole('navigation', { name: 'Project' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((l) => l.textContent);

    expect(labels.indexOf('Tickets')).toBe(labels.indexOf('Board') + 1);
    expect(within(nav).getByRole('link', { name: 'Tickets' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the first page with the default sort and the window text', async () => {
    const { stub } = renderWork(PAGE, world());

    expect(await screen.findByRole('link', { name: 'SVC-1' })).toBeInTheDocument();
    expect(rowsOf()).toHaveLength(26);
    expect(screen.getByText('1–25 of 60')).toBeInTheDocument();

    const query = lastQuery(stub);
    expect(query.get('sort')).toBe('updated');
    expect(query.get('limit')).toBe('25');
    expect(query.get('offset')).toBe('0');
  });

  it('links the id and title to the ticket and the card to its page, and shows cost or a dash', async () => {
    renderWork(PAGE, world());

    const row = (await screen.findByRole('link', { name: 'SVC-2' })).closest(
      'tr',
    ) as HTMLElement;

    const odd = screen.getByRole('link', { name: 'SVC-1' }).closest('tr') as HTMLElement;

    expect(within(row).getByRole('link', { name: 'Ticket number 2' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-2',
    );

    expect(within(row).getByRole('link', { name: 'SVC-C2' })).toHaveAttribute(
      'href',
      '/p/sample-service/cards/SVC-C2',
    );

    expect(row).toHaveTextContent('$0.20');
    expect(odd).toHaveTextContent('—');
    expect(odd).not.toHaveTextContent('$0.00');
  });

  it('opens the ticket when the row is clicked outside the links', async () => {
    const user = userEvent.setup();
    const { router } = renderWork(PAGE, world());

    const row = (await screen.findByRole('link', { name: 'SVC-3' })).closest(
      'tr',
    ) as HTMLElement;

    await user.click(within(row).getAllByRole('cell')[5] as HTMLElement);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/p/sample-service/tickets/SVC-3'),
    );
  });

  it('says there are no tickets, with a way to the Board, when the project has none', async () => {
    renderWork(PAGE, world(0));

    expect(
      await screen.findByRole('heading', { name: 'No tickets yet' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Open the Board' })).toHaveAttribute(
      'href',
      '/p/sample-service/board',
    );

    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
  });

  it('says nothing matches and clears the filters from the empty state', async () => {
    const user = userEvent.setup();
    const { router } = renderWork(`${PAGE}?q=zzz&state=done`, world());

    expect(
      await screen.findByRole('heading', { name: 'No ticket matches these filters' }),
    ).toBeInTheDocument();

    const empty = screen.getByRole('status');
    await user.click(within(empty).getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByRole('link', { name: 'SVC-1' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
  });

  it('draws skeleton rows while the first page loads', async () => {
    renderWork(PAGE, {
      [LIST]: { delayMs: 200, body: { items: [], total: 0 } },
    });

    const loading = await screen.findByRole('status', { name: 'Loading tickets' });

    expect(within(loading).getByRole('table', { name: 'Tickets' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    expect(
      await screen.findByRole('heading', { name: 'No tickets yet' }),
    ).toBeInTheDocument();
  });

  it('keeps the previous rows (dimmed) while the next page loads', async () => {
    const user = userEvent.setup();
    const handler = ticketsTableRoute(ticketRows(60));
    renderWork(PAGE, {
      [LIST]: async (request) => {
        const answer = await handler(request);

        return request.query.get('offset') === '25'
          ? { ...answer, delayMs: 300 }
          : answer;
      },
    });

    await screen.findByRole('link', { name: 'SVC-1' });
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByRole('link', { name: 'SVC-1' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Tickets' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    expect(await screen.findByRole('link', { name: 'SVC-26' })).toBeInTheDocument();
  });

  it('shows an error with Retry that loads the list', async () => {
    const user = userEvent.setup();
    const handler = ticketsTableRoute(ticketRows(5));
    let failing = true;
    renderWork(PAGE, {
      [LIST]: (request) =>
        failing ? refusal(500, 'internal', 'boom') : handler(request),
    });

    expect(await screen.findByRole('alert')).toBeInTheDocument();

    failing = false;
    await user.click(screen.getByRole('button', { name: /retry|try again/i }));

    expect(await screen.findByRole('link', { name: 'SVC-1' })).toBeInTheDocument();
  });
});

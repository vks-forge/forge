/**
 * Pins: the Ticket page's History tab. It sits between Runs and Details and opens from
 * `/tickets/:id/history`; entries group by the reader's day with the newest at the bottom and a
 * "Newest first" toggle; "Status changes only" and "Needs you only" narrow the list and can be
 * cleared; a long detail folds behind "Show more"; a wait reads "waited 2 days" and the exact
 * time is on the time element; each entry links to its run, question or review; "Load earlier"
 * walks the server cursor; loading, empty and error (with retry) are said in words; and the
 * project stream's `["ticket", id]` key refreshes the open tab.
 *
 * Why: the owner opens History to learn why a ticket is where it is. A list in the wrong order,
 * a filter that hides the one entry that mattered, a link that goes nowhere or a tab that goes
 * stale while a Worker is working would each send them back to reading raw threads.
 * Depends on: routes/ticket/tabs/history-tab, components/history/*, the stubbed Forge server.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { pagedHistory } from '#tests/helpers/fake-forge/history-routes.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import {
  LONG_DETAIL,
  manyEntries,
  ticketHistoryEntries,
} from '#tests/helpers/forge-data/history-data.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = '/p/sample-service/tickets/SVC-1/history';
const HISTORY = 'GET /tickets/SVC-1/history';

const headings = (): string[] =>
  screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');

/** The sentence of each row, in list order (the first paragraph of each item). */
const titles = (): string[] =>
  screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent ?? '');

describe('Ticket History tab', () => {
  it('is a tab between Runs and Details and opens from the strip', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: '/p/sample-service/tickets/SVC-1' });

    const strip = await screen.findByRole('tablist', { name: 'Ticket' });
    expect(
      within(strip)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Conversation', 'Runs', 'History', 'Details']);

    await user.click(screen.getByRole('tab', { name: 'History' }));

    expect(router.state.location.pathname).toBe(PAGE);
    expect(await screen.findByRole('region', { name: 'History' })).toBeInTheDocument();
  });

  it('groups entries by day with the newest day last, and flips with Newest first', async () => {
    const user = userEvent.setup();
    renderApp({ path: PAGE });
    await screen.findByRole('region', { name: 'History' });

    const days = headings();
    expect(days).toHaveLength(3);
    expect(days.slice(1)).toEqual(['Yesterday', 'Today']);
    expect(titles()[0]).toBe('Planned for the build lane');
    expect(titles().at(-1)).toBe('Signed off by you and merged');

    const toggle = screen.getByRole('button', { name: 'Newest first' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(headings()[0]).toBe('Today');
    expect(titles()[0]).toBe('Signed off by you and merged');
    expect(titles().at(-1)).toBe('Planned for the build lane');
  });

  it('shows the actor, the exact time on hover, the status words and the wait', async () => {
    renderApp({ path: PAGE });
    await screen.findByRole('region', { name: 'History' });

    const row = screen.getByText('Started working').closest('li')!;
    expect(within(row).getByText('Worker (builder)')).toBeInTheDocument();
    expect(within(row).getByText('waited 2 days')).toBeInTheDocument();
    expect(within(row).getByText('Planned')).toBeInTheDocument();
    expect(within(row).getByText('In progress')).toBeInTheDocument();

    const at = ticketHistoryEntries()[1]!.at;
    const time = row.querySelector('time')!;
    expect(time).toHaveAttribute('datetime', at);
    expect(time).toHaveAttribute('title', new Date(at).toLocaleString());
  });

  it('narrows to status changes or to what needed the owner, and clears', async () => {
    const user = userEvent.setup();
    renderApp({ path: PAGE });
    await screen.findByRole('region', { name: 'History' });

    await user.click(screen.getByRole('button', { name: 'Status changes only' }));
    expect(titles()).toEqual(['Planned for the build lane']);
    await user.click(screen.getByRole('button', { name: 'Status changes only' }));

    await user.click(screen.getByRole('button', { name: 'Needs you only' }));
    expect(titles()).toEqual([
      'Asked you: which database should this use?',
      'You answered: use SQLite',
      'Signed off by you and merged',
    ]);

    await user.click(screen.getByRole('button', { name: 'Status changes only' }));
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(titles()).toHaveLength(6);
  });

  it('folds a long detail behind Show more and leaves short entries alone', async () => {
    const user = userEvent.setup();
    renderApp({ path: PAGE });
    await screen.findByRole('region', { name: 'History' });

    const more = screen.getByRole('button', { name: 'Show more' });
    expect(screen.getAllByRole('button', { name: /Show (more|less)/ })).toHaveLength(1);
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(LONG_DETAIL)).toHaveClass('line-clamp-3');

    await user.click(more);

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    expect(screen.getByText(LONG_DETAIL)).not.toHaveClass('line-clamp-3');
  });

  it('links an entry to its run, its question or its review', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: PAGE });
    await screen.findByRole('region', { name: 'History' });

    const run = within(screen.getByText('Started working').closest('li')!).getByRole(
      'link',
      { name: 'Open run' },
    );

    expect(run).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-1/conversation?run=run-7',
    );

    const answer = screen.getByText('You answered: use SQLite').closest('li')!;
    expect(within(answer).getByRole('link', { name: 'Open question' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-1/conversation',
    );

    const merged = screen.getByText('Signed off by you and merged').closest('li')!;
    expect(within(merged).getByRole('link', { name: 'Open review' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-1/review',
    );

    await user.click(run);
    expect(router.state.location.pathname).toBe(
      '/p/sample-service/tickets/SVC-1/conversation',
    );

    expect(router.state.location.search).toBe('?run=run-7');
  });

  it('loads earlier entries through the cursor and then stops offering more', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PAGE,
      routes: { [HISTORY]: pagedHistory(manyEntries(150)) },
    });

    await screen.findByText('Note 150');
    expect(screen.queryByText('Note 50')).not.toBeInTheDocument();
    expect(screen.getByText('Note 51')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load earlier' }));

    expect(await screen.findByText('Note 1')).toBeInTheDocument();
    expect(screen.getByText('Note 150')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load earlier' }),
    ).not.toBeInTheDocument();

    const calls = forge.stub.callsTo(HISTORY);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.path).toContain('before=');
  });

  it('says it is loading while the answer is slow', async () => {
    renderApp({
      path: PAGE,
      routes: {
        [HISTORY]: {
          ...json({ entries: ticketHistoryEntries(), has_more: false }),
          delayMs: 40,
        },
      },
    });

    expect(await screen.findByRole('status', { name: 'Loading history' })).toBeVisible();
    expect(await screen.findByRole('region', { name: 'History' })).toBeInTheDocument();
  });

  it('says nothing has happened yet when there are no entries', async () => {
    renderApp({ path: PAGE, routes: { [HISTORY]: pagedHistory([]) } });

    expect(await screen.findByText('Nothing has happened yet')).toBeInTheDocument();
  });

  it('says what failed and offers a retry that recovers', async () => {
    let failing = true;
    renderApp({
      path: PAGE,
      routes: {
        [HISTORY]: (request) =>
          failing
            ? refusal(500, 'boom', 'The server broke.')
            : pagedHistory(ticketHistoryEntries())(request),
      },
    });

    const alert = await screen.findByRole('alert');
    const retry = within(alert).getByRole('button', { name: 'Try again' });

    failing = false;
    await userEvent.setup().click(retry);

    expect(await screen.findByRole('region', { name: 'History' })).toBeInTheDocument();
  });

  it('refetches when the project stream names this ticket', async () => {
    const entries = ticketHistoryEntries();
    let served = entries.slice(0, 2);
    const { forge } = renderApp({
      path: PAGE,
      routes: { [HISTORY]: (request) => pagedHistory(served)(request) },
    });

    await screen.findByText('Started working');
    expect(screen.queryByText('Signed off by you and merged')).not.toBeInTheDocument();

    await waitFor(() => expect(forge.streams.projectSources[0]).toBeDefined());
    const stream = forge.streams.projectSources[0]!;
    stream.open();
    served = entries;
    stream.emit('invalidate', { keys: [['ticket', 'SVC-1']] });

    expect(await screen.findByText('Signed off by you and merged')).toBeInTheDocument();
    expect(forge.stub.callsTo(HISTORY)).toHaveLength(2);
  });
});

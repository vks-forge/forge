/**
 * Pins: the Ticket page's tab is a path segment. `/tickets/:id` opens Conversation, an unknown
 * tab replaces itself with it, a deep link opens its tab, Back and Forward step through views,
 * Review exists only while the ticket waits on review or sign-off (and `/review` otherwise
 * falls back), `?run=` picks the run whose thread is shown, a question that waits on the owner
 * stays above whichever tab is open, and cost shows in the header, per run and in Details.
 *
 * Why: the owner follows a ticket from a link, steps back through views and must never lose
 *   the question the Worker is waiting on by changing tab. A Review tab on a ticket that is not
 *   waiting would be an invitation to approve nothing.
 * Depends on: the stubbed Forge server via helpers/render-app, routes/ticket/*.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '#tests/helpers/render-app.js';

const ticket = (id: string, tab = '') =>
  `/p/sample-service/tickets/${id}${tab === '' ? '' : `/${tab}`}`;

const tabNames = (): string[] =>
  within(screen.getByRole('tablist', { name: 'Ticket' }))
    .getAllByRole('tab')
    .map((tab) => tab.textContent ?? '');

describe('Ticket page tabs in the URL', () => {
  it('opens Conversation by default and offers no Review while nothing waits on it', async () => {
    renderApp({ path: ticket('SVC-1') });

    expect(
      await screen.findByRole('log', { name: 'Worker messages' }),
    ).toBeInTheDocument();

    expect(tabNames()).toEqual(['Conversation', 'Runs', 'Details']);
    expect(screen.getByRole('tab', { name: 'Conversation' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('replaces an unknown tab with the conversation', async () => {
    const { router } = renderApp({ path: ticket('SVC-1', 'nonsense') });

    expect(
      await screen.findByRole('log', { name: 'Worker messages' }),
    ).toBeInTheDocument();

    expect(router.state.location.pathname).toBe(ticket('SVC-1', 'conversation'));
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('opens the tab a deep link names', async () => {
    renderApp({ path: ticket('SVC-1', 'runs') });

    expect(await screen.findByRole('region', { name: 'Runs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Runs' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    expect(
      screen.queryByRole('log', { name: 'Worker messages' }),
    ).not.toBeInTheDocument();
  });

  it('steps back and forward through the tabs that were opened', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: ticket('SVC-1') });
    await screen.findByRole('log', { name: 'Worker messages' });

    await user.click(screen.getByRole('tab', { name: 'Runs' }));
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    expect(router.state.location.pathname).toBe(ticket('SVC-1', 'details'));

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe(ticket('SVC-1', 'runs'));
    expect(await screen.findByRole('region', { name: 'Runs' })).toBeInTheDocument();

    await act(() => router.navigate(1));
    expect(await screen.findByRole('region', { name: 'Gates' })).toBeInTheDocument();
  });
});

describe('Review tab', () => {
  it('is there while the ticket waits on review, with a notice that links to it', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: ticket('SVC-5') });

    expect(
      await screen.findByText('This ticket is ready for your review.'),
    ).toBeVisible();

    expect(tabNames()).toEqual(['Conversation', 'Review', 'Runs', 'Details']);

    await user.click(screen.getByRole('link', { name: 'Open the review' }));

    expect(router.state.location.pathname).toBe(ticket('SVC-5', 'review'));
    expect(await screen.findByRole('region', { name: 'Gates' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Review/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('is there for a ticket that needs sign-off', async () => {
    renderApp({ path: ticket('SVC-11') });

    expect(
      await screen.findByText('This ticket needs your sign-off.'),
    ).toBeInTheDocument();

    expect(tabNames()).toContain('Review');
  });

  it('is hidden for any other state, and its URL falls back to the conversation', async () => {
    const { router } = renderApp({ path: ticket('SVC-1', 'review') });

    expect(
      await screen.findByRole('log', { name: 'Worker messages' }),
    ).toBeInTheDocument();

    expect(router.state.location.pathname).toBe(ticket('SVC-1', 'conversation'));
    expect(tabNames()).not.toContain('Review');
  });
});

describe('Ticket page: waiting on you, run choice and cost', () => {
  it('keeps the Worker’s question above whichever tab is open', async () => {
    renderApp({ path: ticket('SVC-4', 'details') });

    expect(
      await screen.findByText(/Question: the Worker needs your answer/),
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
  });

  it('shows the thread of the run ?run= names and keeps it on the Conversation tab link', async () => {
    renderApp({ path: `${ticket('SVC-8', 'conversation')}?run=run-svc-8a` });

    expect(await screen.findByText('This run recorded no messages.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Conversation' })).toHaveAttribute(
      'href',
      `${ticket('SVC-8', 'conversation')}?run=run-svc-8a`,
    );
  });

  it('ignores a ?run= that is not a run of this ticket', async () => {
    renderApp({ path: `${ticket('SVC-1', 'conversation')}?run=run-nope` });

    expect(await screen.findByText(/Sends now retry three times/)).toBeInTheDocument();
  });

  it('shows the ticket cost in the header and each run’s cost on Runs and Details', async () => {
    const user = userEvent.setup();
    renderApp({ path: ticket('SVC-1') });

    expect(await screen.findByText(/Cost of this ticket: \$0\.31/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Runs' }));
    const runs = within(await screen.findByRole('region', { name: 'Runs' }));
    expect(runs.getByText('$0.31')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    const table = await screen.findByRole('table', {
      name: 'Cost of this ticket by run',
    });

    expect(within(table).getByText('run-svc-1')).toBeInTheDocument();
    expect(within(table).getAllByText('$0.31').length).toBeGreaterThan(0);
  });

  it('says "not recorded" for runs whose harness reported no cost, never $0.00', async () => {
    renderApp({ path: ticket('SVC-8', 'details') });

    const table = await screen.findByRole('table', {
      name: 'Cost of this ticket by run',
    });

    expect(within(table).getAllByText(/Cost of run-svc-8a: not recorded/)).toHaveLength(
      1,
    );

    expect(within(table).queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.getByText(/Cost of this ticket: not recorded/)).toBeInTheDocument();
  });
});

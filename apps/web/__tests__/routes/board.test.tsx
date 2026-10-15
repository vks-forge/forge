/**
 * Pins: the Board shows every ticket in its column with the facts that matter, links each
 * card to its page, filters, shows loading/empty/error states, lets the user file a request
 * with the Director, and keeps Cards disabled until W6.
 *
 * Why: the Board is the first screen a user opens each day. A ticket in the wrong column, a
 *   card that is not a link (d-0116), a filter with no way back, or a silent failure would
 *   each cost trust at a glance.
 * Depends on: the stubbed Forge server via helpers/render-app, routes/board/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, networkDown } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';

const BOARD = '/p/sample-service/board';

async function column(name: RegExp | string) {
  return within(await screen.findByRole('region', { name }));
}

describe('Board', () => {
  it('puts tickets in their columns with the facts that matter', async () => {
    renderApp({ path: BOARD });

    const needsYou = await column('Needs you');
    expect(await needsYou.findByText(/Fix off-by-one/)).toBeInTheDocument();
    expect(needsYou.getAllByText('Needs you').length).toBeGreaterThan(0);
    expect(needsYou.getByText(/Move sessions/)).toBeInTheDocument();

    const active = await column('In progress');
    expect(active.getByText(/Stream large CSV/)).toBeInTheDocument();
    expect(active.getByText('Running')).toBeInTheDocument();

    const verifying = await column('Verifying');
    expect(verifying.getByText(/Rework ×1/)).toBeInTheDocument();

    const closed = await column('Blocked and cancelled');
    expect(closed.getByText('Blocked')).toBeInTheDocument();
    expect(closed.getByText('Cancelled')).toBeInTheDocument();
    expect(closed.getByText('Waits for SVC-5 to merge')).toBeInTheDocument();
  });

  it('links every card to its ticket page', async () => {
    renderApp({ path: BOARD });

    const link = await screen.findByRole('link', { name: /Stream large CSV/ });

    expect(link).toHaveAttribute('href', '/p/sample-service/tickets/SVC-3');
  });

  it('filters by text and lane and clears the filter', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await screen.findByText(/Stream large CSV/);

    await user.type(screen.getByRole('searchbox'), 'nightly');
    expect(screen.queryByText(/Stream large CSV/)).not.toBeInTheDocument();
    expect(screen.getByText(/Fix off-by-one/)).toBeInTheDocument();
    expect(screen.getByText('1 of 11 tickets')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText(/Stream large CSV/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Lane'), 'full');
    expect(screen.queryByText(/Stream large CSV/)).not.toBeInTheDocument();
    expect(screen.getByText(/Move sessions/)).toBeInTheDocument();
  });

  it('keeps the Cards view disabled and says when it comes', async () => {
    renderApp({ path: BOARD });

    const cards = await screen.findByRole('button', { name: /Cards/ });

    expect(cards).toBeDisabled();
    expect(cards).toHaveAttribute('title', 'Coming in W6');
    expect(screen.getByRole('button', { name: 'Tickets' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says so when the project has no tickets, with the way to start', async () => {
    renderApp({
      path: BOARD,
      routes: { 'GET /projects/:slug/tickets': json({ items: [], nextCursor: null }) },
    });

    expect(await screen.findByText('No tickets yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Ask the Director')).toBeInTheDocument();
  });

  it('explains a failure and offers to try again', async () => {
    renderApp({ path: BOARD, routes: { 'GET /projects/:slug/tickets': networkDown } });

    expect(await screen.findByText('Cannot reach Forge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('files a request with the Director and links the new ticket', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });

    await user.type(
      await screen.findByLabelText('Ask the Director'),
      'Add a health check',
    );

    await user.click(screen.getByRole('button', { name: 'Send to Director' }));

    const status = await screen.findByText(/Filed as/);
    expect(within(status).getByRole('link', { name: 'SVC-12' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-12',
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Ask the Director')).toHaveValue(''),
    );
  });
});

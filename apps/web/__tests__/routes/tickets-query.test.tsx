/**
 * Pins: the Tickets screen filters, searches (after a pause), sorts and pages on the server,
 * and keeps every one of those choices in the URL so reload, Back and shared links work.
 *
 * Why: if a filter lived only in memory a reload or the Back button would lose it; if search
 * fired per keystroke the server would be hammered; an invalid link must fall back to
 * defaults instead of showing an empty or broken page.
 * Depends on: routes/tickets/*, api/use-tickets-table, helpers/render-work, helpers/tickets-table-world.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose, chosen } from '#tests/helpers/choose.js';
import { renderWork } from '#tests/helpers/render-work.js';
import { LIST, PAGE, lastQuery, world } from '#tests/helpers/tickets-table-world.js';

describe('Tickets list query', () => {
  it('pages on the server, keeps the page in the URL and follows Back', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(PAGE, world());

    await screen.findByRole('link', { name: 'SVC-1' });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('26–50 of 60')).toBeInTheDocument();
    expect(lastQuery(stub).get('offset')).toBe('25');
    expect(router.state.location.search).toBe('?page=2');
    expect(screen.getByRole('link', { name: 'SVC-26' })).toBeInTheDocument();

    await router.navigate(-1);

    expect(await screen.findByText('1–25 of 60')).toBeInTheDocument();
  });

  it('disables Next on the last page', async () => {
    renderWork(`${PAGE}?page=3`, world());

    expect(await screen.findByText('51–60 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('changes the page size and starts again from page one', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(`${PAGE}?page=2`, world());

    await screen.findByText('26–50 of 60');
    await choose(user, 'Rows per page', '10');

    expect(await screen.findByText('1–10 of 60')).toBeInTheDocument();
    expect(lastQuery(stub).get('limit')).toBe('10');
    expect(lastQuery(stub).get('offset')).toBe('0');
    expect(router.state.location.search).toBe('?size=10');
  });

  it('reads filters, sort, page and size from the URL', async () => {
    const { stub } = renderWork(
      `${PAGE}?state=done&lane=standard&sort=cost&page=1&size=10&q=number`,
      world(),
    );

    await waitFor(() => expect(stub.callsTo(LIST)).not.toHaveLength(0));
    const query = lastQuery(stub);

    expect(query.get('state')).toBe('done');
    expect(query.get('lane')).toBe('standard');
    expect(query.get('sort')).toBe('cost');
    expect(query.get('limit')).toBe('10');
    expect(query.get('q')).toBe('number');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('number');
    expect(chosen('Lane')).toBe('standard');
  });

  it('falls back to defaults for invalid URL values', async () => {
    const { stub } = renderWork(
      `${PAGE}?page=abc&lane=bogus&sort=zzz&size=7&state=nope`,
      world(),
    );

    await screen.findByRole('link', { name: 'SVC-1' });
    const query = lastQuery(stub);

    expect(query.get('sort')).toBe('updated');
    expect(query.get('limit')).toBe('25');
    expect(query.get('offset')).toBe('0');
    expect(query.has('lane')).toBe(false);
    expect(query.has('state')).toBe(false);
  });

  it('filters by lane and goes back to page one', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(`${PAGE}?page=2`, world());

    await screen.findByText('26–50 of 60');
    await choose(user, 'Lane', 'express');

    expect(await screen.findByText('1–20 of 20')).toBeInTheDocument();
    expect(lastQuery(stub).get('lane')).toBe('express');
    expect(router.state.location.search).toBe('?lane=express');
  });

  it('filters by several states at once', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(PAGE, world());

    await screen.findByRole('link', { name: 'SVC-1' });
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'Done' }));
    await user.click(screen.getByRole('option', { name: 'In review' }));

    await waitFor(() => expect(lastQuery(stub).get('state')).toBe('done,review'));
    expect(router.state.location.search).toBe('?state=done%2Creview');
    expect(await screen.findByText('1–25 of 30')).toBeInTheDocument();
  });

  it('searches once, 300 ms after the last keystroke', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(PAGE, world());

    await screen.findByRole('link', { name: 'SVC-1' });
    const before = stub.callsTo(LIST).length;

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'number 7');

    expect(stub.callsTo(LIST)).toHaveLength(before);
    await waitFor(() => expect(lastQuery(stub).get('q')).toBe('number 7'));
    expect(stub.callsTo(LIST)).toHaveLength(before + 1);
    expect(router.state.location.search).toBe('?q=number+7');
    expect(await screen.findByText('1–1 of 1')).toBeInTheDocument();
  });

  it('sorts from the Cost header, announces it and keeps it when clicked again', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(PAGE, world());

    await screen.findByRole('link', { name: 'SVC-1' });
    const header = screen.getByRole('columnheader', { name: /Cost/ });
    expect(header).not.toHaveAttribute('aria-sort');

    await user.click(within(header).getByRole('button', { name: 'Cost' }));

    await waitFor(() => expect(header).toHaveAttribute('aria-sort', 'descending'));
    expect(lastQuery(stub).get('sort')).toBe('cost');
    expect(router.state.location.search).toBe('?sort=cost');
    expect(chosen('Sort by')).toBe('Highest cost');
    expect(screen.getByRole('columnheader', { name: /Updated/ })).not.toHaveAttribute(
      'aria-sort',
    );

    await user.click(within(header).getByRole('button', { name: 'Cost' }));

    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('sorts from the Sort by picker and goes back to page one', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(`${PAGE}?page=2`, world());

    await screen.findByText('26–50 of 60');
    await choose(user, 'Sort by', 'Recently created');

    await waitFor(() => expect(lastQuery(stub).get('sort')).toBe('created'));
    expect(lastQuery(stub).get('offset')).toBe('0');
  });

  it('sorts the default column Updated as descending', async () => {
    renderWork(PAGE, world());

    await screen.findByRole('link', { name: 'SVC-1' });

    expect(screen.getByRole('columnheader', { name: /Updated/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('moves to the last page when the URL page is past the end', async () => {
    const { router } = renderWork(`${PAGE}?page=9`, world());

    expect(await screen.findByText('51–60 of 60')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?page=3');
  });
});

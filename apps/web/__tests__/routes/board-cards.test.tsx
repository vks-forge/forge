/**
 * Pins: the Board opens on the Cards view; its six columns come from the column the server
 * rolled up (the UI never decides one); a tile shows type, phase, title, dependency chips, ticket
 * progress and the amber Needs you mark, and is one link to the Card page; type and text filters narrow the cards;
 * the Cards | Tickets choice is remembered; and loading, empty and failure states are worded.
 *
 * Why: the Board is the first screen of the day. A card in the wrong column, a tile that is
 *   not a link, a view choice that resets on reload or a silent failure would each cost trust
 *   at a glance, and a column the UI computed itself could disagree with the server (d-0107).
 * Depends on: the stubbed Forge server via helpers/render-app, routes/board/*, state/board-prefs.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { storageKeyOf } from '#/state/create-persisted-store.js';
import { choose } from '#tests/helpers/choose.js';
import { json, networkDown } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';

const BOARD = '/p/sample-service/board';

async function column(name: RegExp | string) {
  return within(await screen.findByRole('region', { name }));
}

describe('Board, Cards view', () => {
  it('opens on Cards and puts each card in the column the server rolled up', async () => {
    renderApp({ path: BOARD });

    expect(
      (await screen.findByRole('button', { name: 'Cards' })).getAttribute('aria-pressed'),
    ).toBe('true');

    const shaping = await column('Shaping');
    expect(shaping.getByText('Look at webhook retries')).toBeInTheDocument();
    expect(shaping.getByText('Plan a retry strategy for webhooks')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'New' })).not.toBeInTheDocument();
    expect(await column('Queued')).toBeTruthy();

    const needsYou = await column('Needs you');
    expect(needsYou.getByText(/Fix off-by-one/)).toBeInTheDocument();
    // The column heading and the tile's own mark.
    expect(needsYou.getAllByText('Needs you')).toHaveLength(2);

    const active = await column('In progress');
    expect(active.getByText('Stream large CSV exports')).toBeInTheDocument();
    expect(active.getByText('1/3 tickets')).toBeInTheDocument();
    expect(
      active.getByRole('progressbar', { name: '1 of 3 tickets done' }),
    ).toBeInTheDocument();

    expect(
      (await column('Done')).getByText('Rename retries to maxRetries'),
    ).toBeInTheDocument();

    const strip = await screen.findByRole('button', { name: /^Closed, 1 cards/ });

    expect(strip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Should we adopt pnpm?')).not.toBeInTheDocument();
    await userEvent.setup().click(strip);

    expect(
      (await column('Closed')).getByText('Should we adopt pnpm?'),
    ).toBeInTheDocument();
  });

  it('folds Closed into a strip with its count and keeps it open once opened', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });

    const strip = await screen.findByRole('button', { name: /^Closed, 1 cards/ });
    expect(strip).toHaveAttribute('aria-expanded', 'false');

    await user.click(strip);
    expect(await screen.findByRole('region', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Closed' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Collapse Closed' }));
    expect(screen.getByRole('button', { name: /^Closed, 1 cards/ })).toBeInTheDocument();
  });

  it('shows the type label on a tile and links the whole tile to the Card page', async () => {
    renderApp({ path: BOARD });

    const shaping = await column('Shaping');
    const link = shaping.getByRole('link', { name: /Plan a retry strategy/ });

    expect(link).toHaveAttribute('href', '/p/sample-service/cards/FG-C2');
    const tile = within(link.closest('article') as HTMLElement);
    expect(tile.getByText('Plan')).toBeInTheDocument();
    expect(tile.getByText('No tickets yet')).toBeInTheDocument();
  });

  it('filters by type and by text, and clears the filter', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await screen.findByText('Stream large CSV exports');

    await choose(user, 'Type', 'Discussion');

    expect(screen.queryByText('Stream large CSV exports')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /^Closed, 1 cards/ }));
    expect(screen.getByText('Should we adopt pnpm?')).toBeInTheDocument();
    expect(screen.getByText('2 of 6 cards')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.type(screen.getByRole('searchbox'), 'FG-C5');

    expect(screen.getByText('Rename retries to maxRetries')).toBeInTheDocument();
    expect(screen.queryByText('Should we adopt pnpm?')).not.toBeInTheDocument();
  });

  it('remembers the chosen view across a reload and shows tickets when asked', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await user.click(await screen.findByRole('button', { name: 'Tickets' }));

    expect(
      await screen.findByRole('region', { name: 'Inbox and planned' }),
    ).toBeInTheDocument();

    expect(
      JSON.parse(localStorage.getItem(storageKeyOf('board')) ?? '{}').state.view,
    ).toBe('tickets');

    await user.click(screen.getByRole('button', { name: 'Cards' }));

    expect(await screen.findByRole('region', { name: 'Shaping' })).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(storageKeyOf('board')) ?? '{}').state.view,
    ).toBe('cards');
  });

  it('says so when the project has no cards, with the way to start', async () => {
    renderApp({
      path: BOARD,
      routes: { 'GET /projects/:slug/cards': json({ items: [], nextCursor: null }) },
    });

    expect(await screen.findByText('No cards yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create your first card' })).toBeEnabled();
  });

  it('shows the phase in words and the dependencies as chips on a card face', async () => {
    renderApp({ path: BOARD });

    const active = await column('In progress');
    const tile = within(
      active.getByText('Stream large CSV exports').closest('article') as HTMLElement,
    );

    expect(tile.getByText('1/3 tickets')).toBeInTheDocument();
    const chips = tile.getByRole('list', { name: 'Dependencies' });
    expect(within(chips).getByText('Blocked by')).toBeInTheDocument();
    expect(within(chips).getByText('FG-C5')).toBeInTheDocument();

    const shaping = await column('Shaping');
    expect(shaping.getByText('Grilling')).toBeInTheDocument();
    expect(shaping.getByText('Plan ready')).toBeInTheDocument();
    expect(shaping.queryByRole('list', { name: 'Dependencies' })).not.toBeInTheDocument();
  });

  it('says which cards a card blocks, and folds a long list into a count', async () => {
    const row = {
      id: 'FG-C9',
      project: 'sample-service',
      type: 'plan',
      title: 'Foundation work',
      summary: '',
      source: { kind: 'chat', ref: 'web' },
      created_by: { type: 'user', id: 'owner' },
      created_at: '2026-10-10T09:00:00.000Z',
      updated_at: '2026-10-10T09:00:00.000Z',
      ticket_count: 0,
      tickets_done: 0,
      column: 'queued',
      phase: 'queued',
      blocks: ['FG-C1', 'FG-C2', 'FG-C3', 'FG-C4', 'FG-C5'],
    };

    renderApp({
      path: BOARD,
      routes: { 'GET /projects/:slug/cards': json({ items: [row], nextCursor: null }) },
    });

    const queued = await column('Queued');

    expect(queued.getByText('Foundation work')).toBeInTheDocument();
    expect(queued.getAllByText('Blocks')).toHaveLength(3);
    expect(queued.getByText('+2 more blocked')).toBeInTheDocument();
  });

  it('shows a card from an older server that sends no phase or dependencies', async () => {
    const row = {
      id: 'FG-C9',
      project: 'sample-service',
      type: 'plan',
      title: 'Written by an older server',
      summary: '',
      source: { kind: 'chat', ref: 'web' },
      created_by: { type: 'user', id: 'owner' },
      created_at: '2026-10-10T09:00:00.000Z',
      updated_at: '2026-10-10T09:00:00.000Z',
      ticket_count: 0,
      tickets_done: 0,
      column: 'new',
    };

    renderApp({
      path: BOARD,
      routes: { 'GET /projects/:slug/cards': json({ items: [row], nextCursor: null }) },
    });

    const shaping = await column('Shaping');

    expect(shaping.getByText('Written by an older server')).toBeInTheDocument();
    expect(shaping.queryByRole('list', { name: 'Dependencies' })).not.toBeInTheDocument();
  });

  it('explains a failure and offers to try again', async () => {
    renderApp({ path: BOARD, routes: { 'GET /projects/:slug/cards': networkDown } });

    expect(await screen.findByText('Cannot reach Forge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

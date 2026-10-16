/**
 * Pins: a card face shows its phase line ("Grilling · 3 open points", "Plan v2 ready", "4/7
 * tickets"), a priority marker with words, a progress bar with its counts and the Blocked by /
 * Blocks chips; hovering or focusing a card keeps its whole dependency chain lit and dims the
 * rest; cards glide between columns (the reduced-motion swap has its own file); and 60
 * cards render across the columns without error.
 *
 * Why: the Board is read at a glance and worked by keyboard. A phase line that lies, a chain
 *   that only lights one step, a glide that ignores the OS reduce-motion setting, or a board that
 *   chokes on a busy project would each break the one screen the owner opens first (d-0139).
 * Depends on: the stubbed Forge server via helpers/render-app, routes/board/*, domain/card-chain.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';

const BOARD = '/p/sample-service/board';
const NOW = new Date().toISOString();

function card(n: number, over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `FG-C${n}`,
    project: 'sample-service',
    type: 'issue',
    title: `Card number ${n}`,
    summary: '',
    source: { kind: 'chat', ref: 'web' },
    created_by: { type: 'user', id: 'owner' },
    created_at: NOW,
    updated_at: NOW,
    ticket_count: 0,
    tickets_done: 0,
    column: 'shaping',
    phase: 'grilling',
    needs_you: false,
    phase_version: 0,
    priority: 'normal',
    links: [],
    depends_on: [],
    blocks: [],
    ...over,
  };
}

const list = (items: Record<string, unknown>[]) => ({
  'GET /projects/:slug/cards': json({ items, nextCursor: null }),
});

const tile = (title: string) => screen.getByText(title).closest('article') as HTMLElement;

describe('Board: card face', () => {
  it('says the phase with its one number, the priority and the progress', async () => {
    renderApp({
      path: BOARD,
      routes: list([
        card(1, {
          title: 'Grill me',
          phase: 'grilling',
          open_points: 3,
          priority: 'urgent',
        }),
        card(2, {
          title: 'Plan me',
          column: 'needs_you',
          phase: 'plan_ready',
          plan_version: 2,
          needs_you: true,
        }),
        card(3, {
          title: 'Build me',
          column: 'in_progress',
          phase: 'in_progress',
          ticket_count: 7,
          tickets_done: 4,
          priority: 'low',
        }),
        card(4, { title: 'Verify me', phase: 'verifying' }),
      ]),
    });

    await screen.findByText('Grill me');

    expect(
      within(tile('Grill me')).getByText('Grilling · 3 open points'),
    ).toBeInTheDocument();

    expect(within(tile('Grill me')).getByText('Urgent')).toBeInTheDocument();
    expect(within(tile('Plan me')).getByText('Plan v2 ready')).toBeInTheDocument();
    expect(within(tile('Build me')).getByText('4/7 tickets')).toBeInTheDocument();
    expect(
      within(tile('Build me')).getByRole('progressbar', { name: '4 of 7 tickets done' }),
    ).toHaveAttribute('aria-valuenow', '57');

    expect(within(tile('Verify me')).getByText('Verifying')).toBeInTheDocument();
    expect(within(tile('Verify me')).queryByText('Normal')).not.toBeInTheDocument();
  });

  it('leaves a number out when the server did not send it rather than guessing', async () => {
    renderApp({
      path: BOARD,
      routes: list([card(1, { title: 'No count', phase: 'plan_ready' })]),
    });

    await screen.findByText('No count');

    expect(within(tile('No count')).getByText('Plan ready')).toBeInTheDocument();
  });
});

describe('Board: dependency highlight', () => {
  const chain = list([
    card(1, { title: 'Root', column: 'done', phase: 'done', blocks: ['FG-C2'] }),
    card(2, {
      title: 'Middle',
      column: 'queued',
      phase: 'queued',
      depends_on: ['FG-C1'],
      blocks: ['FG-C3'],
    }),
    card(3, { title: 'Leaf', column: 'queued', phase: 'queued', depends_on: ['FG-C2'] }),
    card(4, { title: 'Stranger' }),
  ]);

  it('keeps the whole chain lit on hover and dims the others', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD, routes: chain });
    await screen.findByText('Root');

    await user.hover(tile('Leaf'));

    expect(tile('Root')).toHaveAttribute('data-dimmed', 'false');
    expect(tile('Middle')).toHaveAttribute('data-dimmed', 'false');
    expect(tile('Leaf')).toHaveAttribute('data-dimmed', 'false');
    expect(tile('Stranger')).toHaveAttribute('data-dimmed', 'true');

    await user.unhover(tile('Leaf'));

    expect(tile('Stranger')).toHaveAttribute('data-dimmed', 'false');
  });

  it('does the same for keyboard focus and clears when focus leaves', async () => {
    renderApp({ path: BOARD, routes: chain });
    await screen.findByText('Root');

    const link = within(tile('Middle')).getByRole('link');
    act(() => link.focus());

    expect(tile('Stranger')).toHaveAttribute('data-dimmed', 'true');
    expect(tile('Root')).toHaveAttribute('data-dimmed', 'false');

    act(() => link.blur());

    expect(tile('Stranger')).toHaveAttribute('data-dimmed', 'false');
  });
});

describe('Board: motion', () => {
  it('lets cards glide between columns when motion is allowed', async () => {
    renderApp({ path: BOARD, routes: list([card(1, { title: 'Glider' })]) });
    await screen.findByText('Glider');

    expect(screen.getByRole('list', { name: 'Shaping cards' })).toHaveAttribute(
      'data-motion',
      'glide',
    );
  });
});

describe('Board: a busy project', () => {
  it('renders 60 cards across the columns', async () => {
    const columns = ['shaping', 'needs_you', 'queued', 'in_progress', 'done'] as const;
    const items = Array.from({ length: 60 }, (_, i) =>
      card(i + 1, {
        title: `Busy card ${i + 1}`,
        column: columns[i % columns.length],
        phase: 'in_progress',
        ticket_count: 4,
        tickets_done: i % 5,
        depends_on: i > 0 ? [`FG-C${i}`] : [],
        blocks: i < 59 ? [`FG-C${i + 2}`] : [],
      }),
    );

    renderApp({ path: BOARD, routes: list(items) });

    expect(await screen.findByText('Busy card 60')).toBeInTheDocument();

    for (const column of ['Shaping', 'Needs you', 'Queued', 'In progress', 'Done']) {
      expect(
        within(screen.getByRole('region', { name: column })).getAllByRole('article'),
      ).toHaveLength(12);
    }
  });
});

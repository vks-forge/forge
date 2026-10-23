/**
 * Pins: the ticket tile shows stage, live run, cost and age; the run clock ticks each second and
 * pauses while the tab is hidden; the action button appears only when offered; the card tile
 * shows the roll-up line.
 *
 * Why: the Board is how the owner sees whether work is moving. A frozen clock reads as a stalled
 *   Worker, a Retry button on a ticket that does not offer it would fail, and a roll-up that
 *   hides "waiting for you" would bury the one thing needing them. A hidden tab must not keep a
 *   timer running per tile.
 * Depends on: routes/board/ticket-card, routes/board/card-tile, api/http adapter, helpers/fetch-stub.
 */

import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import { AppProviders } from '#/components/app-providers.js';
import { CardTile } from '#/routes/board/card-tile.js';
import { TicketCard } from '#/routes/board/ticket-card.js';
import { json, stubFetch } from '#tests/helpers/fetch-stub.js';
import { ticketSummary } from '#tests/helpers/work-fixtures.js';

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

function mount(ui: React.ReactElement) {
  const api = createHttpAdapter({ baseUrl: '/api' });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <AppProviders api={api} queryClient={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AppProviders>,
  );
}

const hidden = (value: boolean): void => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('ticket tile progress', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(NOW);
    stubFetch({});
  });

  afterEach(() => {
    hidden(false);
    vi.useRealTimers();
  });

  it('shows stage, the live run with its clock, cost so far and the age', () => {
    mount(
      <TicketCard
        now={NOW}
        showState
        ticket={ticketSummary({
          stage: { index: 2, count: 5, label: 'Review and critique' },
          live_run: { number: 2, agent: 'reviewer', started_at: iso(603_000) },
          cost_usd: 1.5,
          updated_at: iso(5 * 60_000),
        })}
      />,
    );

    expect(screen.getByTitle('Stage 2/5 · Review and critique')).toBeVisible();
    expect(screen.getByText(/run 2 · reviewer/)).toBeVisible();
    expect(screen.getByText('10m 03s')).toBeVisible();
    expect(screen.getAllByText(/Cost so far/).length).toBeGreaterThan(0);
    expect(screen.getByText('$1.50')).toBeVisible();
    expect(screen.getByText('updated 5 min ago')).toBeVisible();
  });

  it('ticks the clock each second and stops while the tab is hidden', () => {
    mount(
      <TicketCard
        now={NOW}
        showState
        ticket={ticketSummary({
          live_run: { number: 1, started_at: iso(9_000) },
        })}
      />,
    );

    expect(screen.getByText('9s')).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('12s')).toBeVisible();

    act(() => hidden(true));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText('22s')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    act(() => hidden(false));

    expect(screen.getByText('22s')).toBeVisible();
  });

  it('shows no run line or stage when the server sent none', () => {
    mount(<TicketCard now={NOW} showState ticket={ticketSummary()} />);

    expect(screen.queryByText(/^run \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Stage \d/)).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('offers no action unless one fits, and Open to answer when it waits for the owner', () => {
    const { rerender } = mount(
      <TicketCard now={NOW} showState ticket={ticketSummary()} />,
    );

    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Open to answer/ }),
    ).not.toBeInTheDocument();

    rerender(
      <AppProviders
        api={createHttpAdapter({ baseUrl: '/api' })}
        queryClient={new QueryClient()}
      >
        <MemoryRouter>
          <TicketCard
            now={NOW}
            showState
            ticket={ticketSummary({
              needs_you: true,
              wait: {
                phase: 'waiting_you',
                text: 'A question is waiting for your answer',
              },
            })}
          />
        </MemoryRouter>
      </AppProviders>,
    );

    expect(screen.getByRole('link', { name: /Open to answer/ })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-3',
    );
  });
});

describe('ticket tile Retry', () => {
  it('shows Retry only when the server offered it and sends the retry action', async () => {
    const stub = stubFetch({
      'POST /interactions/:id/act': () => json({ next: null }),
    });

    mount(
      <TicketCard
        now={NOW}
        showState
        ticket={ticketSummary({ state: 'waiting_human', retry_escalation_id: 'int-9' })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry SVC-3' }));

    await waitFor(() =>
      expect(
        stub.calls.some(
          (c) => c.method === 'POST' && c.path.endsWith('/interactions/int-9/act'),
        ),
      ).toBe(true),
    );
  });
});

describe('card tile roll-up', () => {
  it('shows done, running and waiting for you from the server counts', () => {
    mount(
      <CardTile
        now={NOW}
        dimmed={false}
        onHighlight={() => undefined}
        types={undefined}
        card={
          {
            id: 'FG-C1',
            project: 'sample-service',
            type: 'issue',
            title: 'Big card',
            column: 'in_progress',
            phase: 'in_progress',
            ticket_count: 11,
            tickets_done: 4,
            tickets_running: 2,
            tickets_waiting_you: 1,
            priority: 'normal',
            depends_on: [],
            blocks: [],
            updated_at: iso(60_000),
          } as never
        }
      />,
    );

    expect(
      screen.getByText('4 of 11 done · 2 running · 1 waiting for you'),
    ).toBeVisible();
  });
});

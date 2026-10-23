/**
 * Pins: the Board tile, the card's Tickets tab and the Ticket header show the phase the server
 * derived (chip plus a line with links), a waiting_human ticket with no open owner item is not
 * counted as Needs you anywhere, and the `next` line of an answer reply shows as a short notice.
 *
 * Why: "In progress" while the only Worker slot is taken, and "Needs you" after the owner already
 * answered, were the two ways the owner was misled (CHE-6, 2026-10-22). The server now says where
 * a ticket really is; these tests keep the screens saying it, and keep the owner's queue honest.
 * Depends on: the stubbed Forge server via helpers/render-app, routes/board, routes/card,
 *   routes/ticket, api/announce-next.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { TicketsTab } from '#/routes/card/tabs/tickets-tab.js';
import { boardPrefsStore } from '#/state/board-prefs.js';
import { buildSampleTickets } from '#tests/helpers/forge-data/ticket-fixtures.js';
import { json } from '#tests/helpers/fetch-stub.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { ticketSummary } from '#tests/helpers/work-fixtures.js';

const queued = ticketSummary({
  id: 'SVC-3' as never,
  title: 'Queued behind the slot holder',
  state: 'in_progress',
  wait: {
    phase: 'waiting_slot',
    text: 'Waiting for a Worker slot (SVC-9 is working)',
    holders: ['SVC-9' as never],
  },
});

const held = ticketSummary({
  id: 'SVC-4' as never,
  title: 'Held while the card re-plans',
  state: 'waiting_human',
  needs_you: false,
  card_id: 'FG-C4' as never,
  wait: {
    phase: 'held_by_plan',
    text: 'FG-C4 is re-planning; you will be asked when the plan is ready',
    card_id: 'FG-C4' as never,
  },
});

const asking = ticketSummary({
  id: 'SVC-5' as never,
  title: 'Asking the owner',
  state: 'waiting_human',
  needs_you: true,
  wait: { phase: 'waiting_you', text: 'A question is waiting for your answer' },
});

function detail(id: string, wait: unknown, items: readonly unknown[] = []) {
  const sample = buildSampleTickets().find((item) => item.ticket.id === id)!;

  return json({
    ticket: sample.ticket,
    runs: [],
    gate_results: [],
    interactions: [],
    wait_reason: null,
    wait,
    escalations: [],
    wait_actions: [],
    needs_you_detail: items,
    cost: { total_usd: 0, workers_usd: 0, director_usd: 0, by_run: [] },
  });
}

describe('Board tiles', () => {
  beforeEach(() => {
    boardPrefsStore.setState({ view: 'tickets' });
  });

  it('shows the phase, why and who holds the slot, and keeps the held ticket out of Needs you', async () => {
    renderApp({
      path: '/p/sample-service/board',
      routes: {
        'GET /projects/:slug/tickets': json({
          items: [queued, held, asking],
          nextCursor: null,
        }),
      },
    });

    const needsYou = within(await screen.findByRole('region', { name: 'Needs you' }));
    expect(needsYou.getByText('Asking the owner')).toBeInTheDocument();
    expect(needsYou.queryByText('Held while the card re-plans')).toBeNull();

    const active = within(await screen.findByRole('region', { name: 'In progress' }));
    expect(active.getByText('Waiting for a slot')).toBeInTheDocument();
    expect(active.getByRole('link', { name: 'SVC-9' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-9',
    );

    const waiting = within(
      await screen.findByRole('region', { name: 'Inbox and planned' }),
    );

    expect(waiting.getByText('Held by re-plan')).toBeInTheDocument();
    expect(waiting.getAllByRole('link', { name: 'FG-C4' }).length).toBeGreaterThan(0);
  });
});

describe('Tickets tab of a card', () => {
  it('shows each ticket phase with its reason and links', () => {
    render(
      <MemoryRouter>
        <TicketsTab slug="sample-service" tickets={[queued, held]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Waiting for a slot')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SVC-9' })).toBeInTheDocument();
    expect(screen.getByText('Held by re-plan')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for you')).toBeNull();
  });
});

describe('Ticket header', () => {
  it('says the phase in the pill and the reason as a line with links', async () => {
    renderApp({
      path: '/p/sample-service/tickets/SVC-6',
      routes: {
        'GET /tickets/:id': detail('SVC-6', {
          phase: 'waiting_slot',
          text: 'Waiting for a Worker slot (SVC-3 is working)',
          holders: ['SVC-3'],
        }),
      },
    });

    await screen.findByRole('heading', {
      level: 1,
      name: /Document the public rate limits/,
    });

    expect(screen.getAllByText('Waiting for a slot').length).toBeGreaterThan(0);
    expect(await screen.findByRole('link', { name: 'SVC-3' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-3',
    );
  });

  it('does not say Needs you for a waiting_human ticket with no open owner item', async () => {
    renderApp({
      path: '/p/sample-service/tickets/SVC-4',
      routes: {
        'GET /tickets/:id': detail('SVC-4', {
          phase: 'held_by_plan',
          text: 'FG-C4 is re-planning',
          card_id: 'FG-C4',
        }),
      },
    });

    await screen.findByRole('heading', { level: 1, name: /Fix off-by-one/ });

    expect(screen.getAllByText('Held by re-plan').length).toBeGreaterThan(0);
    expect(screen.queryByText('Needs you')).toBeNull();
    expect(await screen.findByRole('link', { name: 'FG-C4' })).toBeInTheDocument();
  });
});

describe('after an answer', () => {
  it('shows what happens next as a short notice', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/p/sample-service/tickets/SVC-4',
      routes: {
        'POST /interactions/:id/answer': json({
          id: 'int-svc-4',
          status: 'answered',
          next: 'The Director is re-planning; you will be asked when the plan is ready',
        }),
      },
    });

    await openNeedsYou(userEvent.setup());
    await user.type(await screen.findByLabelText('Your answer'), 'Re-plan it');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(
      await screen.findByText(
        'The Director is re-planning; you will be asked when the plan is ready',
      ),
    ).toBeInTheDocument();
  });
});

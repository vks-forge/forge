/**
 * Pins: the card breakdown lists the Director, every ticket and the total; the ticket
 * breakdown lists runs oldest first with "not recorded" (never $0.00) for a run the harness
 * gave no cost; a server that sent no cost says so; every table states that only recorded cost
 * is counted.
 *
 * Why: the owner reads these tables to answer "why did this cost that much?"; a zero that
 *   really means "unknown" would be a wrong answer, and a total that hides it is a floor.
 * Depends on: components/cost/cost-breakdown. Rendered inside a router for the ticket links.
 */

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  CardCostBreakdown,
  TicketCostBreakdown,
} from '#/components/cost/cost-breakdown.js';

const view = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('CardCostBreakdown', () => {
  it('lists the Director, each ticket (as a link) and the total', () => {
    view(
      <CardCostBreakdown
        slug="alpha"
        cost={{
          director_usd: 0.4,
          tickets_usd: 1.25,
          total_usd: 1.65,
          by_ticket: [
            { ticket_id: 'FX-1', title: 'Stream the CSV', usd: 1.25 },
            { ticket_id: 'FX-2', title: 'Tiny fix', usd: 0.004 },
          ],
        }}
      />,
    );

    const table = screen.getByRole('table', { name: 'Cost of this card' });

    expect(
      within(table)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining('Part'),
      expect.stringMatching(/Director.*\$0\.40/),
      expect.stringMatching(/FX-1.*Stream the CSV.*\$1\.25/),
      expect.stringMatching(/FX-2.*Tiny fix.*<\$0\.01/),
      expect.stringMatching(/Total.*\$1\.65/),
    ]);

    expect(within(table).getByRole('link', { name: 'FX-1' })).toHaveAttribute(
      'href',
      '/p/alpha/tickets/FX-1',
    );

    expect(screen.getByText(/real total can be higher/)).toBeInTheDocument();
  });

  it('says so when the server sent no cost', () => {
    view(<CardCostBreakdown slug="alpha" cost={undefined} />);

    expect(screen.getByText(/did not send a cost/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('TicketCostBreakdown', () => {
  const started = '2026-10-16T09:00:00.000Z';

  it('shows recorded runs in dollars and unrecorded ones as not recorded', () => {
    view(
      <TicketCostBreakdown
        cost={{
          total_usd: 0.31,
          by_run: [
            {
              run_id: 'run-1',
              usd: 0.31,
              status: 'success',
              started_at: started,
              recorded: true,
            },
            {
              run_id: 'run-2',
              usd: 0,
              status: 'error',
              started_at: started,
              recorded: false,
            },
          ],
        }}
      />,
    );

    const table = screen.getByRole('table', { name: 'Cost of this ticket by run' });
    const rows = within(table).getAllByRole('row');

    expect(rows[1]).toHaveTextContent('run-1');
    expect(rows[1]).toHaveTextContent('$0.31');
    expect(rows[2]).toHaveTextContent('run-2');
    expect(rows[2]).toHaveTextContent('—');
    expect(rows[2]).toHaveTextContent(/not recorded/);
    expect(within(rows[2]!).queryByText('$0.00')).not.toBeInTheDocument();
    expect(rows[3]).toHaveTextContent(/Total.*\$0\.31/);
  });

  it('says nothing was spent when no Worker ran, and says so for a missing cost', () => {
    const { unmount } = view(<TicketCostBreakdown cost={{ total_usd: 0, by_run: [] }} />);

    expect(screen.getByText(/No Worker has run/)).toBeInTheDocument();
    unmount();

    view(<TicketCostBreakdown cost={undefined} />);

    expect(screen.getByText(/did not send a cost/)).toBeInTheDocument();
  });
});

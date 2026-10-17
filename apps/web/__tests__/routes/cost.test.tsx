/**
 * Pins: the Cost screen says how many runs reported cost, labels models as tokens with no
 * price, lists budgets that exist and says the period budget is not set, ranks tickets and runs
 * (a run with no cost reads "no cost"), and never draws spend when no run reported one.
 *
 * Why: Forge records only the cost a harness reports and has no price table. A total shown
 *   without its coverage, or a dollar figure beside a model, would be believed and be wrong.
 * Depends on: routes/cost/*, domain/cost-view, helpers/render-work.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWork } from '#tests/helpers/render-work.js';
import { costBody } from '#tests/helpers/work-fixtures.js';

const COST = '/p/sample-service/cost';
const REPORT = 'GET /projects/sample-service/cost';

describe('Cost', () => {
  it('states how many runs reported a cost and what the total covers', async () => {
    renderWork(COST, { [REPORT]: { body: costBody() } });

    expect(
      await screen.findByText('5 of 6 runs reported cost. Spend covers only those runs.'),
    ).toBeInTheDocument();

    expect(screen.getByText('Spend reported').closest('div')).toHaveTextContent('$4.25');
  });

  it('shows models as tokens with a no-price note, and the budgets that exist', async () => {
    renderWork(COST, { [REPORT]: { body: costBody() } });

    const models = await screen.findByRole('region', { name: 'By model (tokens)' });
    expect(
      within(models).getByText('Tokens; no price table yet, so no dollars per model.'),
    ).toBeInTheDocument();

    expect(within(models).getByText('claude-sonnet-x')).toBeInTheDocument();
    expect(within(models).getByText('15k tokens')).toBeInTheDocument();

    const budgets = screen.getByRole('region', { name: 'Budgets' });
    expect(within(budgets).getByText('$5.00')).toBeInTheDocument();
    expect(within(budgets).getByText('$1.00')).toBeInTheDocument();
    expect(within(budgets).getByText('Not set')).toBeInTheDocument();
  });

  it('ranks tickets and runs and says when a run reported no cost', async () => {
    renderWork(COST, { [REPORT]: { body: costBody() } });

    const tickets = await screen.findByRole('list', { name: 'Top tickets' });
    expect(
      within(tickets).getByRole('link', { name: 'SVC-3 Stream large CSV' }),
    ).toHaveAttribute('href', '/p/sample-service/tickets/SVC-3');

    const runs = screen.getByRole('list', { name: 'Top runs' });
    expect(within(runs).getByText('no cost')).toBeInTheDocument();
  });

  it('draws no spend and says so when no run reported a cost', async () => {
    renderWork(COST, {
      [REPORT]: {
        body: costBody({
          runs_with_cost: 0,
          total_usd: 0,
          by_ticket: [],
          by_harness: [],
        }),
      },
    });

    expect(
      await screen.findByText('0 of 6 runs reported cost. There is no spend to show.'),
    ).toBeInTheDocument();

    expect(screen.getByText('No run reported a cost in this range.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Spend per day/ })).not.toBeInTheDocument();
  });

  it('asks for the chosen range', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(COST, { [REPORT]: { body: costBody() } });
    await screen.findByText(/runs reported cost/);

    await user.click(screen.getByRole('button', { name: '90d' }));

    await waitFor(() =>
      expect(stub.callsTo(REPORT).some((c) => c.path.includes('range=90d'))).toBe(true),
    );
  });

  it('says there is nothing to show before any run exists', async () => {
    renderWork(COST, {
      [REPORT]: {
        body: costBody({
          runs_total: 0,
          runs_with_cost: 0,
          total_usd: 0,
          by_run: [],
          by_ticket: [],
          by_harness: [],
          by_model: [],
        }),
      },
    });

    expect(await screen.findByText('No runs in this range')).toBeInTheDocument();
  });

  it('pages Top tickets from the server and keeps the page size across pages', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(COST, {
      [REPORT]: { body: costBody({ by_ticket_total: 134, by_run_total: 6 }) },
    });

    const tickets = await screen.findByRole('region', { name: 'Top tickets' });

    expect(within(tickets).getByText(/1–\d+ of 134/)).toBeInTheDocument();
    expect(
      within(tickets).getByRole('button', { name: 'Top tickets: previous page' }),
    ).toBeDisabled();

    await user.click(
      within(tickets).getByRole('button', { name: 'Top tickets: next page' }),
    );

    await waitFor(() =>
      expect(
        stub
          .callsTo(REPORT)
          .some(
            (c) =>
              c.path.includes('ticket_offset=10') && c.path.includes('ticket_limit=10'),
          ),
      ).toBe(true),
    );
  });

  it('asks for a bigger page when the page size changes, for that table only', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(COST, {
      [REPORT]: { body: costBody({ by_ticket_total: 134, by_run_total: 6 }) },
    });

    const runs = await screen.findByRole('region', { name: 'Top runs' });

    await user.click(within(runs).getByRole('button', { name: '25' }));

    await waitFor(() =>
      expect(
        stub
          .callsTo(REPORT)
          .some(
            (c) => c.path.includes('run_limit=25') && c.path.includes('ticket_limit=10'),
          ),
      ).toBe(true),
    );
  });
});

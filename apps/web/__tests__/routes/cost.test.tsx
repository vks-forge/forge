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
      await screen.findByText(
        /5 of 6 runs reported cost\. Spend covers only those runs\./,
      ),
    ).toBeInTheDocument();

    expect(screen.getByText('Total spend').closest('div')).toHaveTextContent('$4.25');
  });

  it('leads with the total, splits it Workers then Director, stacks the bars with a legend and dates the old Director spend', async () => {
    const day = costBody().per_day_split.map((point, i) =>
      i === 29 ? { ...point, worker_usd: 3, director_usd: 7 } : point,
    );

    renderWork(COST, {
      [REPORT]: {
        body: costBody({
          total_usd: 10,
          worker_usd: 3,
          director_usd: 7,
          director_steps_total: 12,
          director_steps_recorded: 12,
          per_day_split: day,
          per_day: day.map((p) => ({
            date: p.date,
            value: p.worker_usd + p.director_usd,
          })),
        }),
      },
    });

    const tile = (await screen.findByText('Total spend')).closest('div');

    expect(tile).toHaveTextContent('$10.00');
    expect(tile).toHaveTextContent('Workers $3.00 · Director $7.00');
    expect(tile).toHaveTextContent(
      '5 of 6 runs and 12 of 12 Director steps reported cost',
    );

    const chart = screen.getByRole('group', { name: 'Spend per day (USD)' });

    expect(chart).toHaveAttribute('aria-roledescription', 'chart');
    expect(
      within(chart.closest('figure')!).getByRole('list', { name: 'Legend' }),
    ).toHaveTextContent(/Workers.*Director/);

    expect(within(chart).getAllByRole('img').at(-1)).toHaveAccessibleName(
      /\$10\.00 \(Workers \$3\.00 · Director \$7\.00\)/,
    );

    expect(
      screen.getByText('Director spend before 20 Oct is dated by card.'),
    ).toBeVisible();
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

    expect(
      screen.getByText('Nothing reported a cost in this range.'),
    ).toBeInTheDocument();

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

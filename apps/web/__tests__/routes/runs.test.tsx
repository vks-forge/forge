/**
 * Pins: the Runs list shows each run's status (a quota-parked run says so), ticket, harness,
 * duration, cost and tokens, a run with no reported cost says so, filters go to the server, and
 * a run opens in a drawer with its gates, folder, session and tokens per model.
 *
 * Why: the owner reads this screen to find the stuck, the failed and the expensive. A parked
 *   run shown as "running", a missing cost shown as $0.00, or a drawer that lost the failing
 *   gate would each send them looking in the wrong place.
 * Depends on: routes/runs/*, api/use-runs, helpers/render-work.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWork } from '#tests/helpers/render-work.js';
import { runDetail, runSummary } from '#tests/helpers/work-fixtures.js';

const RUNS = '/p/sample-service/runs';
const LIST = 'GET /projects/sample-service/runs';

const PARKED = runSummary({
  id: 'run-2',
  ticket_id: 'SVC-4',
  ticket_title: 'Backfill orders',
  harness: 'codex',
  status: 'running',
  paused_harness: true,
  ended_at: undefined,
  duration_ms: 60_000,
  cost_usd: undefined,
  tokens: undefined,
});

const routes = {
  [LIST]: { body: { items: [runSummary(), PARKED], nextCursor: null } },
  'GET /runs/run-1': { body: runDetail() },
};

describe('Runs', () => {
  it('shows status, ticket, harness, duration, cost and tokens per run', async () => {
    renderWork(RUNS, routes);

    const list = await screen.findByRole('list', { name: 'Runs' });
    const done = within(list).getByRole('button', { name: /Open run run-1/ });

    expect(done).toHaveTextContent('Stream large CSV');
    expect(done).toHaveTextContent('Succeeded');
    expect(done).toHaveTextContent('claude');
    expect(done).toHaveTextContent('12m 00s');
    expect(done).toHaveTextContent('$1.20');
    expect(done).toHaveTextContent('15k tokens');
  });

  it('says a quota-parked run is parked and a run without cost has none reported', async () => {
    renderWork(RUNS, routes);

    const parked = await screen.findByRole('button', { name: /Open run run-2/ });

    expect(parked).toHaveTextContent('Parked: quota');
    expect(parked).not.toHaveTextContent('Running');
    expect(parked).toHaveTextContent('no cost reported');
    expect(parked).not.toHaveTextContent('$0.00');
  });

  it('sends the status filter to the server', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(RUNS, routes);
    await screen.findByRole('list', { name: 'Runs' });

    await user.click(screen.getByRole('button', { name: 'Problems' }));

    await waitFor(() =>
      expect(
        stub
          .callsTo(LIST)
          .some(
            (c) => c.path.includes('status=error') && c.path.includes('status=timeout'),
          ),
      ).toBe(true),
    );
  });

  it('opens a run with its gates, folder, session and tokens per model', async () => {
    const user = userEvent.setup();
    renderWork(RUNS, routes);

    await user.click(await screen.findByRole('button', { name: /Open run run-1/ }));

    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText('/work/sample-service/svc-3'),
    ).toBeInTheDocument();

    expect(within(drawer).getByText('sess-abc')).toBeInTheDocument();
    expect(within(drawer).getByText('G1')).toBeInTheDocument();
    expect(within(drawer).getByText('Passed')).toBeInTheDocument();
    expect(within(drawer).getByText('Failed')).toBeInTheDocument();
    expect(within(drawer).getByText('abcdef1')).toBeInTheDocument();
    expect(within(drawer).getByText('claude-sonnet-x')).toBeInTheDocument();
    expect(
      within(drawer).getByRole('link', { name: 'Open ticket SVC-3' }),
    ).toHaveAttribute('href', '/p/sample-service/tickets/SVC-3');
  });

  it('opens straight to a run named in the URL', async () => {
    renderWork(`${RUNS}?run=run-1`, routes);

    expect(await screen.findByText('/work/sample-service/svc-3')).toBeInTheDocument();
  });

  it('explains an empty list and a failed load', async () => {
    renderWork(RUNS, { [LIST]: { body: { items: [], nextCursor: null } } });
    expect(await screen.findByText('No runs here')).toBeInTheDocument();
  });

  it('shows the error with a retry when the list cannot load', async () => {
    renderWork(RUNS, {
      [LIST]: {
        status: 500,
        body: { error: { code: 'boom', message: 'runs exploded' } },
      },
    });

    expect(await screen.findByText('runs exploded')).toBeInTheDocument();
  });
});

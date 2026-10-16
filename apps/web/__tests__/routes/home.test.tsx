/**
 * Pins: project Home shows the readout, what waits on the user, tickets in progress with a
 * stage track and the graphs; a figure the server could not compute reads "No data" (never 0);
 * spend with no reported cost is not drawn as a row of zeros; the range switch refetches.
 *
 * Why: Home is the first screen of every day. A null shown as 0% would read as a perfect or
 *   failing score, a spend chart over unreported cost would claim the work was free, and a
 *   range switch that did not refetch would show the wrong window under the right label.
 * Depends on: routes/home/*, helpers/render-work (fetch stub over the real http adapter).
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWork } from '#tests/helpers/render-work.js';
import { inboxItem, statsBody, ticketSummary } from '#tests/helpers/work-fixtures.js';

const HOME = '/p/sample-service';
const STATS = 'GET /projects/sample-service/stats';

function tile(label: string): HTMLElement {
  return screen.getByText(label).closest('div') as HTMLElement;
}

function routes(stats = statsBody()) {
  return {
    [STATS]: { body: stats },
    'GET /projects/sample-service/tickets': {
      body: {
        items: [
          ticketSummary(),
          ticketSummary({
            id: 'SVC-5' as never,
            title: 'Rotate keys',
            state: 'review',
            needs_you: true,
          }),
          ticketSummary({ id: 'SVC-9' as never, title: 'Old work', state: 'done' }),
        ],
        nextCursor: null,
      },
    },
    'GET /projects/sample-service/inbox': {
      body: { items: [inboxItem()], nextCursor: null },
    },
    'GET /projects/sample-service/inbox/counts': {
      body: { needs_action: 1, unread: 1, all: 1, archived: 0 },
    },
  };
}

describe('Home', () => {
  it('shows the readout, what waits on you and tickets with a stage track', async () => {
    renderWork(HOME, routes());

    const line = await screen.findByLabelText('Project readout');
    expect(within(line).getByText('Workers running').nextSibling).toHaveTextContent('1');
    expect(within(line).getByText('Spend today').nextSibling).toHaveTextContent('$1.50');

    const waiting = await screen.findByRole('list', { name: 'Waiting on you' });
    expect(
      within(waiting).getByRole('link', { name: /Worker asks about migrations/ }),
    ).toHaveAttribute('href', '/p/sample-service/tickets/SVC-3');

    const progress = await screen.findByRole('list', { name: 'In progress' });
    expect(within(progress).getByText('Stream large CSV')).toBeInTheDocument();
    expect(within(progress).getByText('Rotate keys')).toBeInTheDocument();
    expect(within(progress).queryByText('Old work')).not.toBeInTheDocument();
    expect(
      within(progress).getByRole('img', { name: 'Stage 4 of 5: Review, waiting on you' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Open Inbox \(1\)/ })).toBeInTheDocument();
  });

  it('names the action on a tool-approval row and opens the harness tools section', async () => {
    renderWork(HOME, {
      ...routes(),
      'GET /projects/sample-service/inbox': {
        body: {
          items: [
            inboxItem({
              id: 'tool_approval:claude/2.1.142/shell',
              kind: 'tool_approval',
              title: 'Approve tool shell',
              ticket_id: undefined as never,
            }),
          ],
          nextCursor: null,
        },
      },
    });

    const waiting = await screen.findByRole('list', { name: 'Waiting on you' });
    const row = within(waiting).getByRole('listitem');
    const title = within(row).getByRole('link', {
      name: 'Review tool: Approve tool shell',
    });

    expect(title).toHaveAttribute('href', '/settings/harnesses/claude#tools');
    expect(row).toHaveTextContent('Review tool');
    expect(row.querySelector('a[aria-hidden="true"]')).toHaveAttribute(
      'href',
      '/settings/harnesses/claude#tools',
    );

    expect(within(row).getAllByRole('link')).toHaveLength(1);
  });

  it('shows a figure the server could not compute as No data, and a real zero as 0%', async () => {
    renderWork(
      HOME,
      routes(
        statsBody({
          lead_time: { count: 0, median_ms: null, p90_ms: null },
          rework_rate: { hits: 0, total: 3, rate: 0 },
          gate_pass_rate: { hits: 0, total: 0, rate: null },
        }),
      ),
    );

    await screen.findByText('Lead time (median)');

    expect(within(tile('Lead time (median)')).getByText('No data')).toBeInTheDocument();
    expect(within(tile('G1 pass rate')).getByText('No data')).toBeInTheDocument();
    expect(within(tile('Rework rate')).getByText('0%')).toBeInTheDocument();
    expect(
      within(tile('Rework rate')).getByText('0 of 3 new tickets sent back'),
    ).toBeInTheDocument();
  });

  it('does not draw spend as zeros when no run reported a cost', async () => {
    renderWork(
      HOME,
      routes(statsBody({ cost_coverage: { runs_total: 4, runs_with_cost: 0 } })),
    );

    expect(
      await screen.findByText('No run reported a cost in this range.'),
    ).toBeInTheDocument();

    expect(screen.getAllByText('no cost reported').length).toBeGreaterThan(0);
    expect(within(tile('Cost coverage')).getByText('0 of 4')).toBeInTheDocument();
  });

  it('gives each graph a name, a summary and a data table', async () => {
    renderWork(HOME, routes());

    const chart = await screen.findByRole('img', { name: /Tickets done per day/ });

    expect(chart).toHaveAccessibleDescription(/30 days from .* Total 2, peak 2/);
    expect(
      screen.getByRole('table', { name: 'Tickets done per day per day' }),
    ).toBeInTheDocument();
  });

  it('asks the server for the new range when the switch changes', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(HOME, routes());
    await screen.findByLabelText('Project readout');

    expect(stub.callsTo(STATS)[0]?.path).toContain('range=30d');

    await user.click(
      within(screen.getByRole('group', { name: 'Range' })).getByRole('button', {
        name: '7d',
      }),
    );

    await waitFor(() =>
      expect(stub.callsTo(STATS).some((c) => c.path.includes('range=7d'))).toBe(true),
    );

    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says what went wrong when the stats call fails, and keeps the rest of Home', async () => {
    renderWork(HOME, {
      ...routes(),
      [STATS]: {
        status: 500,
        body: { error: { code: 'boom', message: 'stats exploded' } },
      },
    });

    expect(await screen.findByText('stats exploded')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'In progress' })).toBeInTheDocument();
  });
});

describe('Home: starting work', () => {
  it('has a New card button and no Ask the Director box', async () => {
    renderWork(HOME, routes());

    expect(await screen.findByRole('button', { name: 'New card' })).toBeEnabled();
    expect(screen.queryByLabelText('Ask the Director')).not.toBeInTheDocument();
    expect(screen.queryByText('Ask the Director')).not.toBeInTheDocument();
  });

  it('opens the New card popup from the button', async () => {
    const user = userEvent.setup();
    renderWork(HOME, routes());

    await user.click(await screen.findByRole('button', { name: 'New card' }));

    expect(await screen.findByRole('dialog', { name: 'New card' })).toBeInTheDocument();
  });
});

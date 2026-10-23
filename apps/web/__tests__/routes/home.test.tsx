/**
 * Pins: project Home shows what waits on the user, tickets in progress with a stage track and
 * the Overview's figures scoped to this project (KPIs without Active projects, spend over time
 * as one series, harness and lane rings, cost coverage; no projects table, no cross-project
 * list); a figure the server could not compute reads "No data" (never 0); spend with no
 * reported cost is not drawn as a row of zeros. The Filter popover is pinned in
 * home-filters.test.tsx.
 *
 * Why: Home is the first screen of every day. A null shown as 0% would read as a perfect or
 *   failing score, a spend chart over unreported cost would claim the work was free, a Home
 *   that showed other projects' money would mislead, and a filter that did not refetch would
 *   show the wrong window under the right label.
 * Depends on: routes/home/*, helpers/render-work (fetch stub over the real http adapter).
 */

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWork } from '#tests/helpers/render-work.js';
import {
  homeRoutes as routes,
  scopedOverview as scoped,
} from '#tests/helpers/home-world.js';
import { inboxItem, overviewBody } from '#tests/helpers/work-fixtures.js';

const HOME = '/p/sample-service';
const OVERVIEW = 'GET /stats/overview';

function tile(label: string): HTMLElement {
  return screen.getByText(label).closest('div') as HTMLElement;
}

describe('Home', () => {
  it('shows what waits on you and tickets with a stage track', async () => {
    renderWork(HOME, routes());

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
});

describe('Home: figures scoped to this project', () => {
  it('asks the Overview endpoint for this project only, archived included', async () => {
    const { stub } = renderWork(HOME, routes());

    await screen.findByRole('region', { name: 'Key figures' });

    const path = stub.callsTo(OVERVIEW)[0]?.path ?? '';

    expect(path).toContain('projects=sample-service');
    expect(path).toContain('archived=1');
    expect(path).toContain('range=30d');
  });

  it('shows the key figures without Active projects', async () => {
    renderWork(HOME, routes());

    const kpis = await screen.findByRole('region', { name: 'Key figures' });

    expect(within(kpis).getByText('Spend')).toBeInTheDocument();
    expect(within(kpis).getByText('Spend this month')).toBeInTheDocument();
    expect(within(kpis).getByText('Tickets done')).toBeInTheDocument();
    expect(within(kpis).getByText('In progress')).toBeInTheDocument();
    expect(within(kpis).getByText('Waiting on you')).toBeInTheDocument();
    expect(within(kpis).getByText('Workers running')).toBeInTheDocument();
    expect(within(kpis).getByText('Independent check pass rate')).toBeInTheDocument();
    expect(within(kpis).queryByText('Active projects')).not.toBeInTheDocument();
  });

  it('draws spend as one series, the harness and lane rings and the cost coverage', async () => {
    renderWork(HOME, routes());

    expect(
      await screen.findByRole('group', { name: /Spend over time/ }),
    ).toBeInTheDocument();

    expect(screen.queryByText('Spend over time, by project')).not.toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /Tickets done and started/ }),
    ).toBeInTheDocument();

    expect(screen.getByRole('group', { name: /Runs by outcome/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Spend by harness' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Spend by lane' })).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Spend by project' }),
    ).not.toBeInTheDocument();

    expect(screen.getByText(/runs reported a cost/)).toBeInTheDocument();
  });

  it('leaves out the projects table and the cross-project Needs attention list', async () => {
    renderWork(HOME, routes());

    await screen.findByRole('region', { name: 'Key figures' });

    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Projects/ })).not.toBeInTheDocument();
  });

  it('orders the page: waiting and in progress, then figures, then charts', async () => {
    renderWork(HOME, routes());

    const waiting = await screen.findByRole('list', { name: 'Waiting on you' });
    const kpis = await screen.findByRole('region', { name: 'Key figures' });
    const charts = screen.getByRole('heading', { name: 'Spend and activity' });

    expect(
      waiting.compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(
      kpis.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows a figure the server could not compute as No data', async () => {
    renderWork(
      HOME,
      routes(
        scoped({
          kpis: {
            ...overviewBody().kpis,
            g1_pass_rate: { hits: 0, total: 0, rate: null },
          },
        }),
      ),
    );

    await screen.findByRole('region', { name: 'Key figures' });

    expect(
      within(tile('Independent check pass rate')).getByText('No data'),
    ).toBeInTheDocument();
  });

  it('does not draw spend as zeros when no run reported a cost', async () => {
    renderWork(
      HOME,
      routes(
        scoped({
          cost_coverage: {
            runs_total: 4,
            runs_with_cost: 0,
            director_steps: 0,
            director_steps_recorded: 0,
          },
          spend_by_harness: [],
          spend_by_lane: [],
        }),
      ),
    );

    expect(
      (await screen.findAllByText('Nothing reported a cost in this range.')).length,
    ).toBeGreaterThan(0);

    const kpis = screen.getByRole('region', { name: 'Key figures' });

    expect(
      within(within(kpis).getByText('Spend').closest('div') as HTMLElement).getByText(
        'No data',
      ),
    ).toBeInTheDocument();
  });

  it('says there are no figures when the Overview does not know the project', async () => {
    renderWork(HOME, routes(scoped({ projects_included: [], projects: [] })));

    expect(await screen.findByText('No figures for this project')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'In progress' })).toBeInTheDocument();
  });

  it('says what went wrong when the figures call fails, and keeps the rest of Home', async () => {
    renderWork(HOME, {
      ...routes(),
      [OVERVIEW]: {
        status: 500,
        body: { error: { code: 'boom', message: 'stats exploded' } },
      },
    });

    expect(await screen.findByText('stats exploded')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'In progress' })).toBeInTheDocument();
  });
});

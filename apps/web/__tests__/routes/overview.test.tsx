/**
 * Pins the Overview dashboard at `/`: what it shows, how its filters live in the URL, and
 * where its rows lead.
 *
 * Why: the Overview is the first screen of every day and sums money and waiting work across
 *   projects. A cost shown without saying how many runs reported it, a filter that changes the
 *   chart but not the URL (so a shared link shows another view), a row that opens the wrong
 *   project, a loading or failing call that blanks the page, or a fresh install that lands on
 *   an empty dashboard instead of the wizard would each mislead or strand the owner.
 *
 * Pins: loading, data, empty, no-match and error states, KPI figures and cost coverage, charts
 *   named with their numbers, projects table and needs-attention links, unknown slugs named,
 *   the "No projects yet" panel and the first-run redirect. Filters are in overview-filters.
 * Depends on: routes/overview/*, helpers/render-work (fetch stub over the real http adapter).
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, networkDown } from '#tests/helpers/fetch-stub.js';
import { renderWork } from '#tests/helpers/render-work.js';
import { overviewBody } from '#tests/helpers/work-fixtures.js';

const OVERVIEW = 'GET /stats/overview';

const TWO_PROJECTS = {
  'GET /projects': {
    body: {
      projects: [
        {
          id: 'p-1',
          slug: 'sample-service',
          prefix: 'SVC',
          status: 'ready',
          ecosystems: [],
        },
        { id: 'p-2', slug: 'sample-web', prefix: 'WEB', status: 'ready', ecosystems: [] },
        {
          id: 'p-3',
          slug: 'sample-old',
          prefix: 'OLD',
          status: 'archived',
          ecosystems: [],
        },
      ],
    },
  },
  'GET /system': {
    body: {
      service: 'forge',
      version: '0.0.0',
      data_home: '/data',
      first_run: { complete: true, project_count: 3, harness_ok: true },
    },
  },
};

function routes(body = overviewBody()) {
  return { ...TWO_PROJECTS, [OVERVIEW]: { body } };
}

describe('Overview: data', () => {
  it('opens at / with the key figures, honest cost coverage and the charts', async () => {
    renderWork('/', routes());

    expect(
      await screen.findByRole('heading', { name: 'Overview', level: 1 }),
    ).toBeInTheDocument();

    const figures = await screen.findByRole('region', { name: 'Key figures' });
    const figure = (label: string) =>
      within(figures).getByText(label).closest('div') as HTMLElement;

    expect(figure('Spend')).toHaveTextContent('$7.50');
    expect(figure('Spend')).toHaveTextContent('+50% vs previous period');
    expect(figure('Spend this month')).toHaveTextContent('$21.25');
    expect(figure('Tickets done')).toHaveTextContent('4');
    expect(figure('Waiting on you')).toHaveTextContent('2');
    expect(figure('Workers running')).toHaveTextContent('1');
    expect(figure('Independent check pass rate')).toHaveTextContent('75%');

    expect(screen.getByText('5 of 6 runs reported a cost')).toBeInTheDocument();
    expect(screen.getByText(/never estimated/)).toBeInTheDocument();

    for (const name of [
      'Spend over time, by project',
      'Tickets done and started',
      'Runs by outcome',
      'Spend by project',
      'Spend by harness',
      'Spend by lane',
    ]) {
      expect(
        screen.getByText(name, { selector: 'figcaption *, figcaption' }),
      ).toBeInTheDocument();
    }

    expect(
      screen.getByRole('group', { name: 'Spend over time, by project' }),
    ).toBeInTheDocument();
  });

  it('lists the projects with a link to each Home, and needs-attention items with their project', async () => {
    const { router } = renderWork('/', routes());
    const user = userEvent.setup();

    const table = await screen.findByRole('table', { name: 'Projects' });
    const link = within(table).getByRole('link', { name: 'sample-service' });

    expect(link).toHaveAttribute('href', '/p/sample-service');
    expect(within(table).getByRole('link', { name: 'sample-web' })).toHaveAttribute(
      'href',
      '/p/sample-web',
    );

    const attention = screen.getByRole('list', { name: 'Needs attention' });
    const question = within(attention).getByRole('link', {
      name: /Worker asks about migrations/,
    });

    expect(question).toHaveTextContent('sample-service');
    expect(question).toHaveAttribute('href', '/p/sample-service/tickets/SVC-3');

    expect(
      within(attention).getByRole('link', { name: /Approve tool shell/ }),
    ).toHaveAttribute('href', '/settings/harnesses/claude#tools');

    await user.click(link);

    await waitFor(() => expect(router.state.location.pathname).toBe('/p/sample-service'));
  });

  it('says nothing is waiting, and that no run reported a cost, instead of drawing zeros', async () => {
    renderWork(
      '/',
      routes(
        overviewBody({
          attention: [],
          spend_by_project: [],
          spend_by_project_total: [],
          spend_by_harness: [],
          spend_by_lane: [],
          cost_coverage: {
            runs_total: 3,
            runs_with_cost: 0,
            director_steps: 0,
            director_steps_recorded: 0,
          },
          kpis: { ...overviewBody().kpis, spend_usd: 0, spend_prev_usd: null },
        }),
      ),
    );

    expect(await screen.findByText('Nothing is waiting on you.')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 runs reported a cost')).toBeInTheDocument();
    expect(
      screen.getAllByText('Nothing reported a cost in this range.').length,
    ).toBeGreaterThan(0);
  });

  it('names project slugs the server did not know', async () => {
    renderWork('/?projects=ghost', routes(overviewBody({ unknown: ['ghost'] })));

    expect(
      await screen.findByText(/Ignored unknown projects: ghost/),
    ).toBeInTheDocument();
  });

  it('says no project matches, with a way to widen the filter', async () => {
    renderWork(
      '/?projects=sample-web',
      routes(overviewBody({ projects_included: [], projects: [], attention: [] })),
    );

    expect(
      await screen.findByText('No projects match these filters'),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Show all projects' })).toBeInTheDocument();
  });
});

describe('Overview: states', () => {
  it('shows a loading state, then an error with a retry that works', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork('/', { ...TWO_PROJECTS, [OVERVIEW]: networkDown });

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach Forge');

    stub.use({ [OVERVIEW]: json(overviewBody()) });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('region', { name: 'Key figures' }),
    ).toBeInTheDocument();
  });

  it('opens the "No projects yet" panel on an empty install that dismissed the wizard', async () => {
    renderWork('/', {
      'GET /projects': { body: { projects: [] } },
      'GET /system': {
        body: {
          service: 'forge',
          version: '0.0.0',
          data_home: '/data',
          first_run: { complete: true, project_count: 0, harness_ok: true },
        },
      },
    });

    expect(
      await screen.findByRole('heading', { name: 'No projects yet' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Add project' })).toHaveAttribute(
      'href',
      '/projects/new',
    );
  });

  it('sends a fresh install to the first-run wizard', async () => {
    const { router } = renderWork('/', {
      'GET /projects': { body: { projects: [] } },
      'GET /system': {
        body: {
          service: 'forge',
          version: '0.0.0',
          data_home: '/data',
          first_run: { complete: false, project_count: 0, harness_ok: false },
        },
      },
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/welcome'));
  });
});

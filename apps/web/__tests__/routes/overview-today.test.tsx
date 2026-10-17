/**
 * Pins: the Overview's Today range comes first in the Filter popover, groups by the hour only
 * (the other groupings disappear while Today is chosen and return with 7d), asks the server
 * for `range=today` and leaves the grouping to the server; a hand-edited hour grouping on any
 * other range is ignored.
 *
 * Why: Today is cut by the hour while every other range is cut by day, week or month. Offering
 *   Day under Today, or sending `group=hour` with 7d, would be refused by the server and leave
 *   the owner with an error instead of a chart.
 * Depends on: routes/overview/*, components/overview/*, helpers/render-work.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWork } from '#tests/helpers/render-work.js';
import { overviewBody } from '#tests/helpers/work-fixtures.js';

const OVERVIEW = 'GET /stats/overview';

const routes = () => ({
  'GET /system': {
    body: {
      service: 'forge',
      version: '0.0.0',
      data_home: '/data',
      first_run: { complete: true, project_count: 2, harness_ok: true },
    },
  },
  [OVERVIEW]: { body: overviewBody() },
});

async function openFilters(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^Filter/ }));
  await screen.findByRole('dialog', { name: 'Filters' });
}

const lastOverviewCall = (stub: { callsTo(p?: string): { path: string }[] }) =>
  stub.callsTo(OVERVIEW).at(-1)?.path ?? '';

describe('Overview: Today', () => {
  it('offers Today first and groups it by the hour only', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork('/?range=90d&group=week', routes());

    await screen.findByRole('region', { name: 'Key figures' });
    await openFilters(user);

    const ranges = within(screen.getByRole('group', { name: 'Range' })).getAllByRole(
      'button',
    );

    expect(ranges[0]).toHaveTextContent('Today');

    await user.click(screen.getByRole('button', { name: 'Today' }));

    await waitFor(() => expect(router.state.location.search).toBe('?range=today'));
    await waitFor(() => expect(lastOverviewCall(stub)).toContain('range=today'));
    expect(lastOverviewCall(stub)).not.toContain('group=');

    const groups = within(screen.getByRole('group', { name: 'Group by' }));

    expect(groups.getAllByRole('button')).toHaveLength(1);
    expect(groups.getByRole('button', { name: 'Hour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: '7d' }));
    await waitFor(() => expect(router.state.location.search).toBe('?range=7d'));
    expect(screen.queryByRole('button', { name: 'Hour' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('ignores an hour grouping on a range other than Today', async () => {
    const { stub } = renderWork('/?range=7d&group=hour', routes());

    await screen.findByRole('region', { name: 'Key figures' });

    expect(lastOverviewCall(stub)).not.toContain('group=');
  });
});

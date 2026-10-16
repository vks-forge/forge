/**
 * Pins how the Overview's filters live in the URL: range, grouping, project filter and the
 * archived switch each write the search string and the request, a shared link restores them,
 * and the figures refetch every 30 seconds.
 *
 * Why: a filter that changes the chart but not the URL means a shared link shows someone
 *   else a different view, and a grouping that stays on "day" after the range jumps to a year
 *   draws 365 bars of noise. The live refresh is what keeps "waiting on you" honest while the
 *   page is left open.
 * Pins: range change drops a chosen grouping, 12m and All, project filter and Clear, archived
 *   switch lists archived projects and sends the flag, a shared link restores every filter,
 *   30 second refetch.
 * Depends on: routes/overview/*, helpers/render-work (fetch stub over the real http adapter).
 */

import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
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

const lastOverviewCall = (stub: { callsTo(p?: string): { path: string }[] }) =>
  stub.callsTo(OVERVIEW).at(-1)?.path ?? '';

afterEach(() => {
  vi.useRealTimers();
});

describe('Overview: filters live in the URL', () => {
  it('changes the range, refetches with it and drops a chosen grouping', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork('/?group=week', routes());

    await screen.findByRole('region', { name: 'Key figures' });
    expect(lastOverviewCall(stub)).toContain('group=week');

    await user.click(screen.getByRole('button', { name: '90d' }));

    await waitFor(() => expect(router.state.location.search).toBe('?range=90d'));
    await waitFor(() => expect(lastOverviewCall(stub)).toContain('range=90d'));
    expect(lastOverviewCall(stub)).not.toContain('group=');
    expect(screen.getByRole('button', { name: '90d' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('offers 12m and All and groups by month on request', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork('/', routes());

    await screen.findByRole('region', { name: 'Key figures' });
    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(router.state.location.search).toBe('?range=all'));
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Day' }));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?range=all&group=day'),
    );

    await waitFor(() => expect(lastOverviewCall(stub)).toContain('group=day'));
    expect(screen.getByRole('button', { name: '12m' })).toBeInTheDocument();
  });

  it('filters to chosen projects and can show them all again', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork('/', routes());

    await screen.findByRole('region', { name: 'Key figures' });
    await choose(user, 'Projects', 'sample-web');

    await waitFor(() =>
      expect(router.state.location.search).toBe('?projects=sample-web'),
    );

    await waitFor(() => expect(lastOverviewCall(stub)).toContain('projects=sample-web'));

    await user.click(screen.getByRole('button', { name: 'Clear project filter' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('lists archived projects in the filter only when asked, and sends the flag', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork('/', routes());

    await screen.findByRole('region', { name: 'Key figures' });
    await user.click(screen.getByRole('combobox', { name: 'Projects' }));
    expect(screen.queryByRole('option', { name: /sample-old/ })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('switch', { name: 'Include archived projects' }));

    await waitFor(() => expect(router.state.location.search).toBe('?archived=1'));
    await waitFor(() => expect(lastOverviewCall(stub)).toContain('archived=1'));

    await user.click(screen.getByRole('combobox', { name: 'Projects' }));
    expect(await screen.findByRole('option', { name: /sample-old/ })).toBeInTheDocument();
  });

  it('restores every filter from a shared link', async () => {
    const { stub } = renderWork(
      '/?range=12m&group=week&projects=sample-web&archived=1',
      routes(),
    );

    await screen.findByRole('region', { name: 'Key figures' });
    const path = lastOverviewCall(stub);

    expect(path).toContain('range=12m');
    expect(path).toContain('group=week');
    expect(path).toContain('projects=sample-web');
    expect(path).toContain('archived=1');
    expect(screen.getByRole('button', { name: '12m' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(
      screen.getByRole('switch', { name: 'Include archived projects' }),
    ).toBeChecked();
  });
});

describe('Overview: live', () => {
  it('refetches every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { stub } = renderWork('/', routes());

    await screen.findByRole('region', { name: 'Key figures' });
    const before = stub.callsTo(OVERVIEW).length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_500);
    });

    await waitFor(() => expect(stub.callsTo(OVERVIEW).length).toBeGreaterThan(before));
  });
});

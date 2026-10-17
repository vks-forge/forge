/**
 * Pins: the Filter popover on a project's Home holds range and grouping only (no project picker,
 * no archived switch); the button shows the word Filter and a count with the filters as its
 * accessible name; Today comes first and groups by the hour only; a change refetches for this
 * project and is written to the URL; a shared link restores the filters, a project or archived
 * parameter in it is dropped, and Reset returns to a clean URL; New card opens its popup.
 *
 * Why: Home reuses the Overview's filter button, but its project is fixed. A project picker
 *   here would let the owner leave the project they are in, and a filter that did not refetch
 *   would show the wrong window under the right label.
 * Depends on: routes/home/*, helpers/{render-work,home-world} (fetch stub over the real http adapter).
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { homeRoutes as routes } from '#tests/helpers/home-world.js';
import { renderWork } from '#tests/helpers/render-work.js';

const HOME = '/p/sample-service';
const OVERVIEW = 'GET /stats/overview';

describe('Home: the Filter popover', () => {
  const openFilters = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: /^Filter/ }));

    return screen.findByRole('dialog', { name: 'Filters' });
  };

  it('holds range and grouping only, with no project picker or archived switch', async () => {
    const user = userEvent.setup();
    renderWork(HOME, routes());

    const dialog = await openFilters(user);

    expect(within(dialog).getByRole('group', { name: 'Range' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Group by' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/archived/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Projects')).not.toBeInTheDocument();
  });

  it('shows no summary text on the button, but names the filters for assistive tech', async () => {
    renderWork('/p/sample-service?range=7d', routes());

    const button = await screen.findByRole('button', { name: /^Filter/ });

    expect(button).toHaveTextContent(/^Filter1 active$/);
    expect(button).toHaveAccessibleName('Filter: 7d · Day, 1 active');
  });

  it('asks the server for the new range, keeping this project, and writes it to the URL', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(HOME, routes());

    await openFilters(user);
    await user.click(screen.getByRole('button', { name: '7d' }));

    await waitFor(() =>
      expect(stub.callsTo(OVERVIEW).some((c) => c.path.includes('range=7d'))).toBe(true),
    );

    const last = stub.callsTo(OVERVIEW).at(-1)?.path ?? '';

    expect(last).toContain('projects=sample-service');
    expect(router.state.location.search).toBe('?range=7d');
  });

  it('offers Today first, and by the hour only', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(HOME, routes());

    await openFilters(user);

    const ranges = within(screen.getByRole('group', { name: 'Range' })).getAllByRole(
      'button',
    );

    expect(ranges[0]).toHaveTextContent('Today');

    await user.click(screen.getByRole('button', { name: 'Today' }));

    await waitFor(() => expect(router.state.location.search).toBe('?range=today'));
    await waitFor(() =>
      expect(stub.callsTo(OVERVIEW).at(-1)?.path).toContain('range=today'),
    );

    const groups = within(screen.getByRole('group', { name: 'Group by' }));

    expect(groups.getAllByRole('button')).toHaveLength(1);
    expect(groups.getByRole('button', { name: 'Hour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores a shared link, drops a project or archived parameter and resets to clean', async () => {
    const user = userEvent.setup();
    const { stub, router } = renderWork(
      '/p/sample-service?range=90d&projects=other&archived=1',
      routes(),
    );

    await screen.findByRole('region', { name: 'Key figures' });

    const first = stub.callsTo(OVERVIEW)[0]?.path ?? '';

    expect(first).toContain('range=90d');
    expect(first).toContain('projects=sample-service');
    expect(first).not.toContain('other');

    await openFilters(user);
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
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

/**
 * Pins: the memory screen: four tabs with counts, text and tag filters, superseded decisions
 * marked and linked, the detail drawer and its chain, approve and reject behind a confirm,
 * optimistic moves that roll back on failure, and a long list that is windowed.
 *
 * Why: the owner decides what binds the Director from this screen. A rejected approach under
 * Decisions, an answer that appears saved when it was not, or a 130-row list that freezes
 * scrolling are each a loss of trust or of flow. Run against the mock adapter, which answers
 * like the real writer (ids kept, 409 on a second answer).
 * Depends on: routes/memory, mock adapter (zero latency), renderScreens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { renderScreens } from '#tests/helpers/render-screens.js';

const PATH = '/p/sample-service/memory';

async function ready() {
  await screen.findByRole('heading', { name: 'Memory', level: 1 });
  await screen.findByRole('tablist', { name: 'Memory' });
}

describe('memory', () => {
  it('opens on Proposals when answers are waiting, with a count on every tab', async () => {
    renderScreens(PATH);
    await ready();

    expect(screen.getByRole('tab', { name: /Proposals/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    expect(screen.getByRole('tab', { name: /Proposals/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /Decisions/ })).toHaveTextContent('6');
    expect(screen.getByRole('tab', { name: /Rejected/ })).toHaveTextContent('2');
    expect(
      within(screen.getByRole('list', { name: 'Proposals' })).getAllByRole('listitem'),
    ).toHaveLength(3);
  });

  it('marks a superseded decision and can hide it', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('tab', { name: /Decisions/ }));
    const row = screen
      .getByRole('button', { name: /Open d-0003/ })
      .closest('li') as HTMLElement;

    expect(within(row).getByText('Superseded')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Hide superseded' }));
    expect(screen.queryByRole('button', { name: /Open d-0003/ })).not.toBeInTheDocument();
  });

  it('filters by text and by tag and says how many are shown', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search memory' }),
      'migrations',
    );

    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.click(screen.getByRole('button', { name: 'tests' }));
    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open x-0001/ })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search memory' }), 'zzz');
    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
  });

  it('approving asks first, then moves the proposal to Decisions with its id kept', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Approve x-0001' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Approve this proposal?',
    });

    expect(dialog).toHaveTextContent(/cannot undo/);
    await user.click(within(dialog).getByRole('button', { name: 'Approve proposal' }));

    expect(await screen.findByText(/x-0001 approved/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open x-0001/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Decisions/ }));
    expect(screen.getByRole('button', { name: /Open x-0001/ })).toBeInTheDocument();
  });

  it('rejecting needs a reason before the button works', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Reject x-0002' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reject this proposal?',
    });

    const confirm = within(dialog).getByRole('button', { name: 'Reject proposal' });
    expect(confirm).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText('Why are you rejecting it?'),
      'too broad',
    );

    await user.click(confirm);

    expect(await screen.findByText(/x-0002 rejected/)).toBeInTheDocument();
    expect((await api.memory.get('sample-service', 'x-0002')).rejected_reason).toBe(
      'too broad',
    );
  });

  it('puts the list back and says why when the server refuses an answer', async () => {
    const user = userEvent.setup();
    renderScreens(PATH, (api) => ({
      ...api,
      memory: {
        ...api.memory,
        answer: () =>
          Promise.reject(
            new ApiError('http', 'x-0003 is not a pending proposal', {
              status: 409,
              code: 'not_a_pending_proposal',
            }),
          ),
      },
    }));

    await ready();

    await user.click(screen.getByRole('button', { name: 'Approve x-0003' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approve proposal' }));

    const alert = await screen.findByText(/Not saved, the list was put back/);
    expect(alert).toHaveTextContent('x-0003 is not a pending proposal');
    expect(screen.getByRole('button', { name: /Open x-0003/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Proposals/ })).toHaveTextContent('3');
  });

  it('opens a record in a drawer, links the supersede chain and follows it', async () => {
    const user = userEvent.setup();
    const { router } = renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('tab', { name: /Decisions/ }));
    await user.click(screen.getByRole('button', { name: /Open d-0003/ }));
    const drawer = await screen.findByRole('dialog');
    const link = await within(drawer).findByRole('button', { name: /Replaced by/ });
    expect(link).toHaveTextContent('d-0006');
    expect(router.state.location.search).toBe('?record=d-0003');

    await user.click(link);
    await waitFor(() => expect(router.state.location.search).toBe('?record=d-0006'));
    const next = await screen.findByRole('button', { name: /Replaces/ });
    expect(next).toHaveTextContent('d-0003');
  });

  it('windows a long list so only a few rows are in the page', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('tab', { name: /Outcomes/ }));
    const rows = within(screen.getByRole('list', { name: 'Outcomes' })).getAllByRole(
      'listitem',
    );

    expect(rows.length).toBeLessThan(40);
    expect(rows[0]).toHaveAttribute('aria-setsize', '130');
  });

  it('shows an empty state and an error state', async () => {
    const empty = renderScreens(PATH, (api) => ({
      ...api,
      memory: { ...api.memory, list: () => Promise.resolve([]) },
    }));

    expect(await screen.findByText('No decisions yet')).toBeInTheDocument();
    empty.unmount();

    renderScreens(PATH, (api) => ({
      ...api,
      memory: {
        ...api.memory,
        list: () => Promise.reject(new ApiError('network', 'down')),
      },
    }));

    expect(await screen.findByText('Cannot reach Forge')).toBeInTheDocument();
  });
});

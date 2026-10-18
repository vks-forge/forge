/**
 * Pins: the memory list: four tabs with counts, tag filter, superseded decisions marked, each row
 * a link to its record page (and the old `?record=` link redirecting there), approve and reject
 * behind a confirm, optimistic moves that roll back on failure, and a long list that is
 * windowed. Search is pinned in memory-search.test.tsx, the record page in memory-record.test.tsx.
 *
 * Why: the owner decides what binds the Director from this screen. A rejected approach under
 * Decisions, an answer that appears saved when it was not, or a 130-row list that freezes
 * scrolling are each a loss of trust or of flow. Run over the stubbed Forge server, which
 * answers like the real writer (ids kept, 409 on a second answer).
 * Depends on: routes/memory, the stubbed Forge server (helpers/fake-forge), renderScreens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, networkDown, refusal } from '#tests/helpers/fetch-stub.js';
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
      .getByRole('link', { name: /Open d-0003/ })
      .closest('li') as HTMLElement;

    expect(within(row).getByText('Superseded')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Hide superseded' }));
    expect(screen.queryByRole('link', { name: /Open d-0003/ })).not.toBeInTheDocument();
  });

  it('filters by tag and says how many are shown', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('button', { name: 'tests' }));
    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open x-0001/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('3 records')).toBeInTheDocument();
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
    expect(screen.queryByRole('link', { name: /Open x-0001/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Decisions/ }));
    expect(screen.getByRole('link', { name: /Open x-0001/ })).toBeInTheDocument();
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
    renderScreens(PATH, {
      routes: {
        'POST /projects/:slug/memory/proposals/:id/approve': refusal(
          409,
          'not_a_pending_proposal',
          'x-0003 is not a pending proposal',
        ),
      },
    });

    await ready();

    await user.click(screen.getByRole('button', { name: 'Approve x-0003' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approve proposal' }));

    const alert = await screen.findByText(/Not saved, the list was put back/);
    expect(alert).toHaveTextContent('x-0003 is not a pending proposal');
    expect(screen.getByRole('link', { name: /Open x-0003/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Proposals/ })).toHaveTextContent('3');
  });

  it('opens a record on its own page, and an old ?record= link goes there too', async () => {
    const user = userEvent.setup();
    const { router, unmount } = renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('tab', { name: /Decisions/ }));
    await user.click(screen.getByRole('link', { name: /Open d-0003/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/p/sample-service/memory/d-0003'),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: /Run the full test suite/ }),
    ).toBeInTheDocument();

    unmount();
    const legacy = renderScreens(`${PATH}?record=d-0006`);
    await waitFor(() =>
      expect(legacy.router.state.location.pathname).toBe(
        '/p/sample-service/memory/d-0006',
      ),
    );

    expect(legacy.router.state.location.search).toBe('');
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
    const empty = renderScreens(PATH, {
      routes: { 'GET /projects/:slug/memory': json({ records: [] }) },
    });

    expect(await screen.findByText('No decisions yet')).toBeInTheDocument();
    empty.unmount();

    renderScreens(PATH, { routes: { 'GET /projects/:slug/memory': networkDown } });

    expect(await screen.findByText('Cannot reach Forge')).toBeInTheDocument();
  });
});

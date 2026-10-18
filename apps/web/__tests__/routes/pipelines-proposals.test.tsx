/**
 * Pins: a Director suggestion for a lane shows on that lane's tab with what changes (stages added,
 * removed or moved, marked in words), the Director's own reasons linked to their tickets, and Accept
 * and Reject; Accept asks first and writes with the project's version; Reject needs a reason; a stale
 * suggestion says "The lane changed since; nothing was applied" and cannot be accepted; every refusal
 * is explained and nothing is claimed that was not done.
 *
 * Why: accepting rewrites a lane every future ticket of the project runs. Without the diff the owner
 * cannot see what they approve, without the stale state they could apply a change to a list it was
 * never made for, and without a required reason "never suggest this again" would be an accident.
 * Depends on: components/pipelines/{proposal-banner,proposal-card,proposal-dialogs,lane-diff-list},
 * api/use-proposals, helpers/proposal-world, the stubbed Forge server.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { networkDown } from '#tests/helpers/fetch-stub.js';
import {
  PROPOSAL_ROUTE,
  addReviewerProposal,
  proposalView,
  removeReviewProposal,
} from '#tests/helpers/forge-data/proposal-data.js';
import { proposalWorld } from '#tests/helpers/proposal-world.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PATH = '/p/sample-service/settings/pipelines?lane=standard';

function open(
  list = [addReviewerProposal()],
  options: Parameters<typeof proposalWorld>[1] = {},
) {
  const world = proposalWorld(list, options);

  return { world, ...renderApp({ path: PATH, routes: world.routes }) };
}

const banner = (): Promise<HTMLElement> =>
  screen.findByRole('region', { name: 'The Director’s suggestions for this lane' });

describe('Pipelines tab: a Director suggestion', () => {
  it('shows the change in the lane with the stage marked added, and the reasons linked to tickets', async () => {
    open();

    const card = await within(await banner()).findByRole('region', {
      name: 'Standard lane: Add Security review after g1',
    });

    const diff = within(card).getByRole('list', { name: 'Lane with the change' });
    const added = within(diff).getByText('Security review').closest('li');

    expect(added).toHaveTextContent('Added');
    expect(within(diff).getByText('Review')).not.toHaveClass('line-through');
    expect(card).toHaveTextContent('The Director made this change on 3 tickets');

    const reasons = within(card).getByRole('list', { name: 'The Director’s reasons' });

    expect(within(reasons).getByRole('link', { name: 'SVC-1' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-1',
    );

    expect(reasons).toHaveTextContent('It edits the login handler.');
  });

  it('shows a removed stage struck through in its place', async () => {
    open([removeReviewProposal()]);

    const diff = await screen.findByRole('list', { name: 'Lane with the change' });
    const removed = within(diff).getByText('Review');

    expect(removed).toHaveClass('line-through');
    expect(removed.closest('li')).toHaveTextContent('Removed');
  });

  it('shows the suggestion only on its own lane', async () => {
    const { world } = open([addReviewerProposal({ lane: 'express' })]);

    await screen.findByRole('tablist', { name: 'Lane' });
    await waitFor(() => expect(world.pending()).toHaveLength(1));

    expect(
      screen.queryByRole('region', { name: 'The Director’s suggestions for this lane' }),
    ).toBeNull();
  });

  it('shows nothing when there is nothing to decide', async () => {
    open([]);

    await screen.findByRole('tablist', { name: 'Lane' });

    expect(screen.queryByText(/The Director suggests/)).toBeNull();
  });

  it('says so, with a retry, when the suggestions cannot be read', async () => {
    renderApp({ path: PATH, routes: { [PROPOSAL_ROUTE]: networkDown } });

    expect(
      (await screen.findAllByText(/Could not check for the Director’s suggestions/))[0],
    ).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: 'Try again' })[0]).toBeEnabled();
  });
});

describe('Pipelines tab: accepting', () => {
  it('asks first, showing the lane after the change, then writes with the project version and the note', async () => {
    const user = userEvent.setup();
    const { world } = open();

    await user.click(await screen.findByRole('button', { name: 'Accept change' }));
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent('Change this lane for the project?');
    expect(dialog).toHaveTextContent('Every new ticket in the Standard lane');
    expect(
      within(
        within(dialog).getByRole('list', { name: 'The lane after the change' }),
      ).getByText('Security review'),
    ).toBeInTheDocument();

    expect(world.accepted).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Makes sense');
    await user.click(within(dialog).getByRole('button', { name: 'Accept the change' }));

    await waitFor(() =>
      expect(world.accepted[0]).toEqual({ expected_version: 5, reason: 'Makes sense' }),
    );

    expect(await screen.findByText('The lane was changed')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/The Director suggests/)).toBeNull());
  });

  it('sends nothing when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    const { world } = open();

    await user.click(await screen.findByRole('button', { name: 'Accept change' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(world.accepted).toHaveLength(0);
  });

  it.each([
    ['stale', 'The lane changed since; nothing was applied.'],
    ['conflict', /Someone changed this project’s settings/],
    ['invalid', /no longer passes the pipeline rules/],
    ['not_pending', /already decided/],
  ] as const)(
    'explains a refused accept (%s) and claims no change',
    async (mode, words) => {
      const user = userEvent.setup();
      open([addReviewerProposal()], { accept: mode });

      await user.click(await screen.findByRole('button', { name: 'Accept change' }));
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Accept the change',
        }),
      );

      const notice = await screen.findByText('Nothing was changed');

      expect(notice.closest('[role="alert"]')).toHaveTextContent(words);
      expect(screen.queryByText('The lane was changed')).toBeNull();
    },
  );
});

describe('Pipelines tab: rejecting', () => {
  it('needs a reason of three characters before it can be sent', async () => {
    const user = userEvent.setup();
    const { world } = open();

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('alertdialog');
    const send = within(dialog).getByRole('button', { name: 'Reject the suggestion' });

    expect(send).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Reason for rejecting'), 'no');

    expect(send).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Reason for rejecting'), 'pe');
    await user.click(send);

    await waitFor(() => expect(world.rejected[0]).toEqual({ reason: 'nope' }));
    expect(await screen.findByText('Suggestion rejected')).toBeInTheDocument();
  });

  it('says the lane stays and that the Director will not suggest it again', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'The lane stays as it is, and the Director will not suggest this again',
    );
  });
});

describe('Pipelines tab: a stale suggestion', () => {
  it('says the lane changed, offers no Accept and no diff, and can still be rejected', async () => {
    const user = userEvent.setup();
    const { world } = open([proposalView({ stale: true })]);

    const card = await screen.findByRole('region', {
      name: 'Standard lane: Add Security review after g1',
    });

    expect(
      within(card).getByText('The lane changed since; nothing was applied.'),
    ).toBeVisible();

    expect(within(card).getByRole('button', { name: 'Accept change' })).toBeDisabled();
    expect(within(card).queryByRole('list', { name: 'Lane with the change' })).toBeNull();

    await user.click(within(card).getByRole('button', { name: 'Reject' }));
    await user.type(
      within(await screen.findByRole('alertdialog')).getByLabelText(
        'Reason for rejecting',
      ),
      'Lane was edited',
    );

    await user.click(screen.getByRole('button', { name: 'Reject the suggestion' }));

    await waitFor(() => expect(world.rejected).toHaveLength(1));
  });
});

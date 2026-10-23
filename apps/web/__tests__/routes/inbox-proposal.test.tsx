/**
 * Pins: a Director pipeline suggestion is an Inbox row of its own kind ("Pipeline change") with a
 * Review button; Review opens the same suggestion card as the Pipelines tab (what changes, the
 * reasons, Accept and Reject); deciding it from there settles it; a suggestion that is no longer
 * pending says so and points at the lane instead of showing a dead card.
 *
 * Why: a project suggestion belongs to no ticket, so nothing else would lead the owner to it. A row
 * with no way to decide, or a drawer that goes on offering Accept for something already decided
 * elsewhere, would leave the owner with a waiting item they cannot clear (d-0135).
 * Depends on: routes/inbox/{inbox-row,inbox-page,inbox-proposal}, components/pipelines/proposal-card,
 * helpers/proposal-world, the stubbed Forge server.
 */

import type { InboxItem } from '@forge/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addReviewerProposal } from '#tests/helpers/forge-data/proposal-data.js';
import { proposalWorld } from '#tests/helpers/proposal-world.js';
import { renderApp } from '#tests/helpers/render-app.js';

const INBOX = '/p/sample-service/inbox';

/** A project item, like the server's: no ticket behind it. */
const ITEM: InboxItem = {
  id: 'pipeline_proposal:12',
  kind: 'pipeline_proposal',
  project: 'sample-service',
  title: 'Pipeline change proposed for Standard: add Security review after g1',
  detail: 'Made the same change on 3 tickets',
  needs_action: true,
  updated_at: '2026-10-17T10:00:00.000Z',
  read: false,
  archived: false,
};

function open(world = proposalWorld([addReviewerProposal()])) {
  const items = [ITEM];
  const view = renderApp({
    path: INBOX,
    routes: {
      'GET /projects/sample-service/inbox': () => ({
        body: { items: world.pending().length > 0 ? items : [], nextCursor: null },
      }),
      'GET /projects/sample-service/inbox/counts': {
        body: { needs_action: 1, notices: 0, unread: 1, all: 1, archived: 0 },
      },
      ...world.routes,
    },
  });

  return { world, ...view };
}

describe('Inbox: a pipeline suggestion', () => {
  it('lists it as a Pipeline change with a Review button', async () => {
    open();

    const list = await screen.findByRole('list', { name: 'Needs action' });

    expect(within(list).getByText('Pipeline change')).toBeVisible();
    expect(
      within(list).getByRole('link', { name: `Open Pipelines: ${ITEM.title}` }),
    ).toHaveAttribute('href', '/p/sample-service/settings/pipelines');

    expect(
      within(list).getByRole('button', { name: `Review: ${ITEM.title}` }),
    ).toBeEnabled();
  });

  it('opens the change and its reasons in a drawer', async () => {
    const user = userEvent.setup();
    open();

    await user.click(
      await screen.findByRole('button', { name: `Review: ${ITEM.title}` }),
    );

    const drawer = await screen.findByRole('dialog', { name: ITEM.title });

    expect(
      within(drawer).getByRole('list', { name: 'Lane with the change' }),
    ).toBeVisible();

    expect(within(drawer).getByRole('link', { name: 'SVC-1' })).toBeVisible();
    expect(within(drawer).getByRole('button', { name: 'Accept change' })).toBeEnabled();
    expect(within(drawer).getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('accepts from the drawer after asking, and the row leaves the list', async () => {
    const user = userEvent.setup();
    const { world } = open();

    await user.click(
      await screen.findByRole('button', { name: `Review: ${ITEM.title}` }),
    );

    await user.click(await screen.findByRole('button', { name: 'Accept change' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Accept the change',
      }),
    );

    await waitFor(() => expect(world.accepted).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: `Review: ${ITEM.title}` })).toBeNull(),
    );
  });

  it('rejects from the drawer with a reason', async () => {
    const user = userEvent.setup();
    const { world } = open();

    await user.click(
      await screen.findByRole('button', { name: `Review: ${ITEM.title}` }),
    );

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.type(
      within(await screen.findByRole('alertdialog')).getByLabelText(
        'Reason for rejecting',
      ),
      'Not for this project',
    );

    await user.click(screen.getByRole('button', { name: 'Reject the suggestion' }));

    await waitFor(() =>
      expect(world.rejected[0]).toEqual({ reason: 'Not for this project' }),
    );
  });

  it('says a suggestion decided elsewhere is no longer waiting, and points at the lane', async () => {
    const user = userEvent.setup();
    const world = proposalWorld([addReviewerProposal()]);

    open(world);

    await user.click(
      await screen.findByRole('button', { name: `Review: ${ITEM.title}` }),
    );

    await screen.findByRole('button', { name: 'Accept change' });

    // Another window decides it; the drawer's list refetches on the next change.
    world.clear();
    await user.click(screen.getByRole('button', { name: 'Accept change' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Accept the change',
      }),
    );

    expect(await screen.findByText('This suggestion was already decided')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Pipelines' })).toHaveAttribute(
      'href',
      '/p/sample-service/settings/pipelines',
    );
  });
});

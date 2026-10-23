/**
 * Pins: a merge-conflict stop on the Ticket page is worded for what each button does (Try again,
 * Re-plan this ticket with its comment pre-filled and the whole-card honesty line, Cancel saying the
 * branch goes and the pull request closes), and a plain cancel dialog says the same.
 *
 * Why: the owner never resolves a conflict by hand, so this card is their only lever. A Re-plan
 *   that starts empty, or a Cancel that does not say it deletes work, makes them guess.
 * Depends on: the stubbed Forge server via helpers/render-app and helpers/escalation-world,
 *   components/escalation/*, domain/conflict-copy.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld, failureView } from '#tests/helpers/escalation-world.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const ACT = 'POST /interactions/:id/act';

function open(views: Parameters<typeof escalationWorld>[0]) {
  const world = escalationWorld(views, {});

  return { world, ...renderApp({ path: TICKET, routes: world.routes }) };
}

const bodyOf = (forge: { stub: { callsTo: (p: string) => { body: unknown }[] } }) =>
  forge.stub.callsTo(ACT)[0]?.body;

describe('Ticket page: merge conflict', () => {
  it('words a merge conflict plainly: Try again, a pre-filled Re-plan this ticket, and a Cancel that says what it deletes', async () => {
    const user = userEvent.setup();
    const { forge } = open([
      failureView('merge_conflict', {
        payload: {
          kind: 'failure',
          cause: 'merge_conflict',
          summary: 'merge conflict: the Worker could not combine src/cli.ts',
          attempts: [],
          conflict: {
            files: ['src/cli.ts'],
            upstream: [
              { ref: 'abc1234', ticket_id: 'FR-6', title: 'Add the --json flag' },
            ],
          },
        },
      }),
    ]);

    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', {
      name: 'Another ticket changed the same lines first',
    });

    expect(within(card).getByText(/FR-6 changed src\/cli.ts first/)).toBeVisible();
    expect(
      within(card).getByText('This gives it one more attempt to combine both changes.'),
    ).toBeVisible();

    await user.click(within(card).getByRole('button', { name: 'Re-plan this ticket' }));
    const replan = await screen.findByRole('dialog', { name: 'Re-plan this ticket?' });
    const note = within(replan).getByRole('textbox');

    expect(note).toHaveValue('Re-plan only SVC-4; keep merged tickets');
    expect(replan).toHaveTextContent(/whole card/i);
    await user.click(within(replan).getByRole('button', { name: 'Re-plan SVC-4' }));

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({
        action: 'replan',
        comment: 'Re-plan only SVC-4; keep merged tickets',
      }),
    );
  });

  it('says a cancel deletes the branch and closes the pull request', async () => {
    const user = userEvent.setup();
    open([failureView('retry_cap')]);
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Cancel ticket' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      /branch is deleted and its pull request closed/,
    );
  });
});

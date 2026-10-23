/**
 * Pins: a held decision draws as the shared escalation card with what was found (worst first,
 * `file:line`, evidence), how often it was sent back and the files the plan did not name; offers
 * exactly the actions the server listed; Merge anyway and Continue need a reason of five characters,
 * say they overrule a hold and post the contract body; a refusal stays readable in the dialog.
 *
 * Why: a hold is the owner's call, with the evidence in front of them. A finding the owner cannot
 *   locate, a Merge anyway that needs no reason or does not say it cannot be undone, or a refusal
 *   that closes the dialog would each send the owner to the wrong decision (d-0135).
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/finished-work-views, routes/ticket/tabs/review-tab, components/escalation/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld } from '#tests/helpers/escalation-world.js';
import { decisionView } from '#tests/helpers/finished-work-views.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const REVIEW = `${TICKET}/review`;
const ACT = 'POST /interactions/:id/act';

function open(
  views: Parameters<typeof escalationWorld>[0],
  options: Parameters<typeof escalationWorld>[1] = {},
  path = REVIEW,
) {
  const world = escalationWorld(views, {
    ticketStatus: { 'SVC-4': 'waiting_human' },
    ...options,
  });

  return { world, ...renderApp({ path, routes: world.routes }) };
}

const bodyOf = (forge: { stub: { callsTo: (p: string) => { body: unknown }[] } }) =>
  forge.stub.callsTo(ACT)[0]?.body;

describe('held decision: findings', () => {
  it('shows the findings worst first with file and line, and how often it was sent back', async () => {
    open([decisionView('findings_hold')]);
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', {
      name: /Held: Critique found problems that need your decision/,
    });

    const list = within(card).getByRole('list', { name: 'Findings from Critique' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('High');
    expect(items[0]).toHaveTextContent('src/window.ts:41');
    expect(items[0]).toHaveTextContent('new Date(start) is read without a time zone');
    expect(items[1]).toHaveTextContent('Low');
    expect(within(card).getByText('Sent back 2 of 2 times so far.')).toBeVisible();
  });

  it('offers exactly the actions the server listed, and Merge anyway is not the highlighted one', async () => {
    open([decisionView('findings_hold')]);
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', { name: /Held: Critique/ });
    const names = within(card)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(names).toEqual([
      'Merge anyway',
      'Send back for rework',
      'Re-plan',
      'Cancel ticket',
    ]);
  });
});

describe('held decision: Merge anyway', () => {
  it('says it merges despite the findings and cannot be undone, and keeps Send off below five characters', async () => {
    const user = userEvent.setup();

    open([decisionView('findings_hold')]);
    await openNeedsYou(userEvent.setup());
    await user.click(await screen.findByRole('button', { name: 'Merge anyway' }));

    const dialog = await screen.findByRole('dialog', { name: 'Merge anyway?' });

    expect(dialog).toHaveTextContent(
      /merges the change although a check found blocking problems/,
    );

    expect(dialog).toHaveTextContent(/cannot be undone/);
    expect(dialog).toHaveTextContent(
      /Recorded on the card\. Only you can do this\. The gates still passed\./,
    );

    const send = within(dialog).getByRole('button', { name: 'Merge SVC-4 anyway' });

    expect(send).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Why is it fine to merge?'), 'four');

    expect(send).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Why is it fine to merge?'), 's');

    expect(send).toBeEnabled();
  });

  it('posts the reason, then says who overruled', async () => {
    const user = userEvent.setup();
    const { forge } = open([decisionView('findings_hold')]);
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Merge anyway' }));

    const dialog = await screen.findByRole('dialog', { name: 'Merge anyway?' });

    await user.type(
      within(dialog).getByLabelText('Why is it fine to merge?'),
      'Local time is what this report wants',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Merge SVC-4 anyway' }));

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({
        action: 'merge_anyway',
        comment: 'Local time is what this report wants',
      }),
    );

    expect(await screen.findByText(/Merged anyway by you/)).toBeVisible();
  });

  it('keeps the dialog open and explains a refusal', async () => {
    const user = userEvent.setup();
    const world = escalationWorld([decisionView('findings_hold')], {
      ticketStatus: { 'SVC-4': 'waiting_human' },
    });

    const { forge } = renderApp({
      path: REVIEW,
      routes: {
        ...world.routes,
        [ACT]: {
          status: 409,
          body: {
            error: {
              code: 'merge_refused',
              message: 'no',
              detail: 'a conflict in src/a.ts',
            },
          },
        },
      },
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Merge anyway' }));

    const dialog = await screen.findByRole('dialog', { name: 'Merge anyway?' });

    await user.type(
      within(dialog).getByLabelText('Why is it fine to merge?'),
      'Just do it',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Merge SVC-4 anyway' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The change could not be merged: a conflict in src/a.ts',
    );

    expect(forge.stub.callsTo(ACT)).toHaveLength(1);
  });
});

describe('held decision: keyboard', () => {
  it('reaches Merge anyway by keyboard, opens its dialog with Enter and closes it with Escape, keeping the ticket held', async () => {
    const user = userEvent.setup();
    const { forge } = open([decisionView('findings_hold')]);
    await openNeedsYou(userEvent.setup());

    const button = await screen.findByRole('button', { name: 'Merge anyway' });

    button.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Merge anyway?' })).toBeVisible();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Merge anyway?' })).toBeNull(),
    );

    expect(forge.stub.callsTo(ACT)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Merge anyway' })).toBeVisible();
  });
});

describe('held decision: scope drift', () => {
  it('lists the files the plan did not name and offers Continue, Re-plan and Cancel', async () => {
    open([decisionView('scope_drift')]);
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', {
      name: 'Held: the work went beyond its plan',
    });

    expect(within(card).getByText('2 files the plan did not name')).toBeVisible();
    expect(within(card).getByText('src/billing/invoice.ts')).toBeVisible();

    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Continue', 'Re-plan', 'Cancel ticket']);
  });

  it('needs a reason to Continue and posts it', async () => {
    const user = userEvent.setup();
    const { forge } = open([decisionView('scope_drift')]);
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Continue' }));

    const dialog = await screen.findByRole('dialog', { name: 'Continue as is?' });
    const send = within(dialog).getByRole('button', { name: 'Continue' });

    expect(send).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText('Why is it fine to go on?'),
      'Billing is in scope',
    );

    await user.click(send);

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({
        action: 'continue',
        comment: 'Billing is in scope',
      }),
    );

    expect(await screen.findByText(/Continued as is by you/)).toBeVisible();
  });
});

/**
 * Pins: Re-plan, Cancel ticket and Merge anyway open a confirmation that lists, from live data,
 * what the action changes (held and kept tickets and the stop for a re-plan; the run, branch,
 * pull request and dependents for a cancel; the overruled check for a merge anyway), name the act
 * and the ticket on the confirm button, open with Cancel focused, hold the confirm while the list
 * loads, fall back to the generic words when the list cannot be read, and for a mechanical stop
 * offer Send back for rework instead of a re-plan.
 *
 * Why: these buttons reach beyond their ticket. A generic "are you sure?" let the owner re-plan a
 *   card without knowing which tickets would be held, cancel without knowing a pull request would
 *   close, or merge anyway without naming the check overruled; and an Enter on a focused confirm
 *   would commit it (error prevention).
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/finished-work-views, components/escalation/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { consequenceRoutes } from '#tests/helpers/consequence-views.js';
import { escalationWorld } from '#tests/helpers/escalation-world.js';
import { decisionView } from '#tests/helpers/finished-work-views.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const REVIEW = '/p/sample-service/tickets/SVC-4/review';
const ACT = 'POST /interactions/:id/act';
const TICKET = { id: 'SVC-4', title: 'Report window' };

const REPLAN = {
  action: 'replan',
  ticket: TICKET,
  card_id: 'SVC-C1',
  ticket_replaced: true,
  held: [{ id: 'SVC-7', title: 'Export button' }],
  kept: [
    { id: 'SVC-3', title: 'Schema', status: 'done' },
    { id: 'SVC-5', title: 'Chart', status: 'in_progress' },
  ],
  stop: { cause: 'findings_hold', summary: 'Critique found problems', findings: 2 },
  mechanical: null,
};

const CANCEL = {
  action: 'cancel',
  ticket: TICKET,
  run_active: true,
  branch: 'forge/SVC-4',
  has_worktree: true,
  pr_number: 12,
  dependents: [],
};

const MERGE = {
  action: 'merge_anyway',
  ticket: TICKET,
  overruled: [
    {
      stage_label: 'Critique',
      summary: 'Critique found problems',
      counts: { high: 1, low: 1 },
      findings: [
        {
          severity: 'high',
          where: 'src/window.ts:41',
          issue: 'The window is computed in local time.',
        },
      ],
    },
  ],
  branch: 'forge/SVC-4',
  pr_number: 12,
};

function open(consequences: Record<string, Record<string, unknown>> = {}, extra = {}) {
  const world = escalationWorld([decisionView('findings_hold')], {
    ticketStatus: { 'SVC-4': 'waiting_human' },
  });

  return renderApp({
    path: REVIEW,
    routes: { ...world.routes, ...consequenceRoutes(consequences), ...extra },
  });
}

async function openDialog(button: string, role: 'dialog' | 'alertdialog' = 'dialog') {
  const user = userEvent.setup();

  await openNeedsYou(userEvent.setup());
  await user.click(await screen.findByRole('button', { name: button }));

  return { user, dialog: await screen.findByRole(role) };
}

describe('Re-plan confirmation', () => {
  it('lists the held and kept tickets, the stop and the owner approval, and names the ticket on the button', async () => {
    open({ replan: REPLAN });
    const { dialog } = await openDialog('Re-plan');

    const list = await within(dialog).findByRole('list', { name: 'What this changes' });

    expect(list).toHaveTextContent('SVC-4 stays parked and is replaced');
    expect(list).toHaveTextContent(
      'why SVC-4 stopped (Critique found problems, with 2 findings)',
    );

    expect(list).toHaveTextContent(
      '1 ticket that has not started is held until you approve',
    );

    expect(within(list).getByRole('link', { name: 'SVC-7' })).toBeVisible();
    expect(list).toHaveTextContent('Export button');
    expect(list).toHaveTextContent('Schema (done)');
    expect(list).toHaveTextContent('Chart (in progress)');
    expect(list).toHaveTextContent(
      'You approve the new plan before anything is replaced.',
    );

    expect(within(dialog).getByRole('button', { name: 'Re-plan SVC-4' })).toBeVisible();
  });

  it('opens with Cancel focused, so a stray Enter leaves instead of re-planning', async () => {
    const { forge } = open({ replan: REPLAN });
    const { user, dialog } = await openDialog('Re-plan');

    await within(dialog).findByRole('list', { name: 'What this changes' });

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Re-plan/ })).toBeNull(),
    );

    expect(forge.stub.callsTo(ACT)).toHaveLength(0);
  });

  it('offers Send back for rework for a mechanical stop and opens that dialog from it', async () => {
    open({ replan: { ...REPLAN, mechanical: { kind: 'lockfile' } } });
    const { user, dialog } = await openDialog('Re-plan');

    expect(
      await within(dialog).findByText(/looks like a lockfile problem/),
    ).toBeVisible();

    expect(dialog).toHaveTextContent(
      'Send back for rework fixes this without re-planning.',
    );

    await user.click(
      within(dialog).getByRole('button', { name: 'Send back for rework' }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Send back for rework' }),
    ).toBeVisible();
  });

  it('does not offer the cheaper action for a stop that needs a plan', async () => {
    open({ replan: REPLAN });
    const { dialog } = await openDialog('Re-plan');

    await within(dialog).findByRole('list', { name: 'What this changes' });

    expect(
      within(dialog).queryByRole('button', { name: 'Send back for rework' }),
    ).toBeNull();
  });

  it('holds the confirm while the list loads', async () => {
    open(
      {},
      {
        'GET /tickets/:id/consequences': { body: REPLAN, delayMs: 1200 },
      },
    );

    const { user, dialog } = await openDialog('Re-plan');

    await user.type(within(dialog).getByRole('textbox'), 'split the report');

    const send = within(dialog).getByRole('button', { name: 'Re-plan SVC-4' });

    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Checking what this changes',
    );

    expect(send).toBeDisabled();
    await waitFor(() => expect(send).toBeEnabled(), { timeout: 4000 });
  });

  it('falls back to the generic words, and still lets the owner act, when the list cannot be read', async () => {
    const { forge } = open(
      {},
      {
        'GET /tickets/:id/consequences': {
          status: 500,
          body: { error: { code: 'internal', message: 'boom' } },
        },
      },
    );

    const { user, dialog } = await openDialog('Re-plan');

    expect(
      await within(dialog).findByText(/Could not list what this changes/),
    ).toBeVisible();

    expect(dialog).toHaveTextContent(/Tickets that have not started are replaced/);

    await user.type(within(dialog).getByRole('textbox'), 'split the report');
    await user.click(within(dialog).getByRole('button', { name: 'Re-plan SVC-4' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({
        action: 'replan',
        comment: 'split the report',
      }),
    );
  });
});

describe('Cancel ticket confirmation', () => {
  it('lists the stopped run, the deleted branch, the closed pull request and the kept commit id', async () => {
    open({ cancel: CANCEL });
    const { dialog } = await openDialog('Cancel ticket', 'alertdialog');

    const list = await within(dialog).findByRole('list', { name: 'What this changes' });

    expect(list).toHaveTextContent('The Worker running on it stops now.');
    expect(list).toHaveTextContent(
      'working folder and its local branch (forge/SVC-4) are deleted',
    );

    expect(list).toHaveTextContent('Pull request #12 is closed');
    expect(list).toHaveTextContent('The last commit id stays on the card');
    expect(within(dialog).getByRole('button', { name: 'Cancel SVC-4' })).toBeVisible();
  });

  it('opens with Cancel focused', async () => {
    open({ cancel: CANCEL });
    const { dialog } = await openDialog('Cancel ticket', 'alertdialog');

    await within(dialog).findByRole('list', { name: 'What this changes' });

    // The leave-it button of a cancel is "Keep running": two buttons are never both called Cancel.
    expect(within(dialog).getByRole('button', { name: 'Keep running' })).toHaveFocus();
  });

  it('names the tickets that wait on it and cancels them together in one click', async () => {
    const { forge } = open({
      cancel: { ...CANCEL, dependents: [{ id: 'SVC-8', title: 'Waits on four' }] },
    });

    const { user, dialog } = await openDialog('Cancel ticket', 'alertdialog');

    expect(await within(dialog).findByRole('link', { name: 'SVC-8' })).toBeVisible();

    const confirm = within(dialog).getByRole('button', {
      name: 'Cancel SVC-4 and 1 waiting',
    });

    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT)[0]?.body).toEqual({
        action: 'cancel',
        cascade: true,
      }),
    );
  });
});

describe('Merge anyway confirmation', () => {
  it('names the overruled check with its findings and what the merge then does', async () => {
    open({ merge_anyway: MERGE });
    const { dialog } = await openDialog('Merge anyway');

    const list = await within(dialog).findByRole('list', { name: 'What this changes' });

    expect(list).toHaveTextContent('Overrules Critique: 1 high, 1 low.');
    expect(list).toHaveTextContent(
      'src/window.ts:41 The window is computed in local time.',
    );

    expect(list).toHaveTextContent(
      'goes on to sign-off and merges forge/SVC-4 (pull request #12)',
    );

    expect(list).toHaveTextContent('A merge cannot be undone from Forge.');
    expect(
      within(dialog).getByRole('button', { name: 'Merge SVC-4 anyway' }),
    ).toBeVisible();

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});

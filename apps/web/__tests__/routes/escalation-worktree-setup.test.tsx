/**
 * Pins: a failed workspace setup shows on the Ticket page as one card that says nothing was spent,
 * names the step and its exact command (any language), gives one hint, keeps the printed tail one
 * click away, and offers Try again, Edit setup steps, Start without setup (after a confirm that
 * says what will likely fail) and Cancel ticket, each posting the contract body; while Forge is
 * still installing, the ticket says which step is running.
 *
 * Why: no Worker started and nothing was spent, so the owner must be able to read why in one pass
 *   and choose a way forward without a terminal (d-0135, d-0180). Skipping setup lets a Worker run
 *   on a bare copy, so it must never happen by one stray click (nielsen 5).
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/setup-views, components/escalation/escalation-worktree-setup, routes/ticket/ticket-wait.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld } from '#tests/helpers/escalation-world.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { worktreeSetupView } from '#tests/helpers/setup-views.js';
import type { StubRequest, StubResponse } from '#tests/helpers/fetch-stub.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const ACT = 'POST /interactions/:id/act';
const TITLE = 'Forge could not get SVC-4’s workspace ready';

function open(view = worktreeSetupView()) {
  const world = escalationWorld([view]);

  return { world, ...renderApp({ path: TICKET, routes: world.routes }) };
}

const bodyOf = (forge: { stub: { callsTo: (p: string) => { body: unknown }[] } }) =>
  forge.stub.callsTo(ACT)[0]?.body;

describe('Ticket page: workspace setup failed', () => {
  it('names the step and its command, says nothing was spent and shows the hint', async () => {
    open();
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', { name: TITLE });

    expect(card).toHaveTextContent(/Forge makes a fresh copy of your project/);
    expect(within(card).getByText('Install packages')).toBeInTheDocument();
    expect(within(card).getByText('uv sync --frozen')).toBeInTheDocument();
    expect(card).toHaveTextContent(/no Worker started and nothing was spent/);
    expect(card).toHaveTextContent('The last lines it printed are below.');
  });

  it('keeps what the step printed behind a button until it is opened', async () => {
    const user = userEvent.setup();
    open();
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', { name: TITLE });
    const toggle = within(card).getByRole('button', {
      name: /What it printed \(last 40 lines\)/,
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText(/lockfile is out of date/)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByLabelText('What the step printed')).toHaveTextContent(
      /error: lockfile is out of date/,
    );
  });

  it('hints at a missing tool, using the first word of the command', async () => {
    open(worktreeSetupView({ command: 'bundle install', exit_code: 127, tail: '' }));
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', { name: TITLE });

    expect(card).toHaveTextContent(
      'This computer does not have bundle, or Forge cannot find it.',
    );
  });

  it('hints at the time limit when the step timed out', async () => {
    open(worktreeSetupView({ timed_out: true, exit_code: null }));
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', { name: TITLE });

    expect(card).toHaveTextContent(/ran out of time/);
    expect(card).toHaveTextContent(/raise the time limit in the setup step/);
  });

  it('links to the setup steps in the project settings', async () => {
    open();
    await openNeedsYou(userEvent.setup());

    const link = await screen.findByRole('link', { name: 'Edit setup steps' });

    expect(link).toHaveAttribute('href', '/p/sample-service/settings/checks#setup');
    expect(screen.getByText(/the ticket tries again by itself/)).toBeInTheDocument();
  });

  it('tries again in one click', async () => {
    const user = userEvent.setup();
    const { forge } = open();
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(bodyOf(forge)).toEqual({ action: 'retry' }));
    expect(await screen.findByText(/Retried by you/)).toBeInTheDocument();
  });

  it('asks before starting without setup, says what will likely fail, and can be left', async () => {
    const user = userEvent.setup();
    const { forge } = open();
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Start without setup' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Start without setup?',
    });

    expect(dialog).toHaveTextContent(
      'The Worker starts without these packages. Checks that need them will likely fail.',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    expect(forge.stub.callsTo(ACT)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Start without setup' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Start without setup',
      }),
    );

    await waitFor(() => expect(bodyOf(forge)).toEqual({ action: 'skip_setup' }));
    expect(await screen.findByText(/Started without setup by you/)).toBeInTheDocument();
  });

  it('cancels the ticket only after a confirm', async () => {
    const user = userEvent.setup();
    const { forge } = open();
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Cancel ticket' }));

    expect(forge.stub.callsTo(ACT)).toHaveLength(0);

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Cancel this ticket?',
    });

    const confirm = within(dialog).getByRole('button', { name: 'Cancel SVC-4' });

    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(bodyOf(forge)).toEqual({ action: 'cancel' }));
  });

  it('draws only the buttons the server offered', async () => {
    open(worktreeSetupView({}, { actions: ['retry', 'cancel'] }));
    await openNeedsYou(userEvent.setup());

    await screen.findByRole('region', { name: TITLE });

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start without setup' }),
    ).not.toBeInTheDocument();
  });
});

describe('Ticket page: the workspace is being prepared', () => {
  it('says which step is running and for how long, as one sentence', async () => {
    const world = escalationWorld([], { waitActions: { 'SVC-4': ['cancel'] } });
    const detail = world.routes['GET /tickets/:id'] as (
      request: StubRequest,
    ) => StubResponse;

    renderApp({
      path: TICKET,
      routes: {
        ...world.routes,
        'GET /tickets/:id': (request) => {
          const reply = detail(request) as { body: Record<string, unknown> };

          return {
            status: 200,
            body: {
              ...reply.body,
              wait_reason: 'Getting the workspace ready: Install packages (0:42)',
            },
          };
        },
      },
    });

    expect(
      await screen.findByText('Getting the workspace ready: Install packages (0:42).'),
    ).toBeInTheDocument();

    expect(screen.getByText(/It starts by itself when that clears/)).toBeInTheDocument();
  });
});

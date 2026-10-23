/**
 * Pins: on the Ticket page every escalation kind draws as the shared card and every action the
 * server lists is a working button that posts the contract's body; refusals (already settled,
 * dependents, still broken) are explained in place; while the Director is still looking nothing is
 * asked of the owner; a wait with no question (review, scheduler hold) still offers its actions.
 *
 * Why: a ticket that waits with only reason text, or a button that does nothing, leaves the owner
 *   stuck with no way forward (d-0135). Each assertion here is one way that would happen.
 * Depends on: the stubbed Forge server via helpers/render-app and helpers/escalation-world,
 *   routes/ticket/use-ticket-dock, routes/ticket/ticket-wait, components/escalation/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FAILURE_CAUSES } from '#/schemas/escalation.js';
import {
  FAILURE_ACTIONS,
  escalationWorld,
  failureView,
  questionView,
} from '#tests/helpers/escalation-world.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const ACT = 'POST /interactions/:id/act';

const LABEL: Record<string, string> = {
  retry: 'Retry',
  replan: 'Re-plan',
  cancel: 'Cancel ticket',
  run_as_express: 'Run as Express',
  recheck: 'I fixed it, check again',
};

/** The merge-conflict card words two buttons for what they do there. */
const CONFLICT_LABEL: Record<string, string> = {
  retry: 'Try again',
  replan: 'Re-plan this ticket',
};

function open(views: Parameters<typeof escalationWorld>[0], opts = {}, path = TICKET) {
  const world = escalationWorld(views, opts);

  return { world, ...renderApp({ path, routes: world.routes }) };
}

const bodyOf = (forge: { stub: { callsTo: (p: string) => { body: unknown }[] } }) =>
  forge.stub.callsTo(ACT)[0]?.body;

describe('Ticket page: question escalation', () => {
  it('shows the question, the Director note, the suggestion and the recommended option', async () => {
    open([questionView()]);
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', { name: 'The Worker has a question' });

    expect(within(card).getByText(/UTC or the account time zone/)).toBeInTheDocument();
    expect(within(card).getByText(/does not say which one/)).toBeInTheDocument();
    expect(within(card).getByText(/Use UTC; the plan keeps/)).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: /UTC.*Recommended/ }),
    ).toBeInTheDocument();

    expect(
      within(card).getByRole('button', { name: 'Account time zone' }),
    ).toBeInTheDocument();
  });

  it('sends the suggested answer as text in one click', async () => {
    const user = userEvent.setup();
    const { forge } = open([questionView()]);
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Use suggested' }));

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({
        action: 'answer',
        text: 'Use UTC; the plan keeps all reports in UTC.',
      }),
    );

    expect(await screen.findByText(/Answered by you/)).toBeInTheDocument();
  });

  it('sends a chosen option by its id', async () => {
    const user = userEvent.setup();
    const { forge } = open([questionView()]);
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Account time zone' }));

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({ action: 'answer', option_id: 'o2' }),
    );
  });

  it('sends free text with Ctrl+Enter and keeps Send off while the box is empty', async () => {
    const user = userEvent.setup();
    const { forge } = open([questionView()]);
    await openNeedsYou(userEvent.setup());

    const send = await screen.findByRole('button', { name: 'Send answer' });

    expect(send).toBeDisabled();

    await user.type(
      screen.getByRole('textbox', { name: 'Your answer' }),
      'Per account{Control>}{Enter}{/Control}',
    );

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({ action: 'answer', text: 'Per account' }),
    );
  });

  it('says so, and stays on screen, when someone answered first', async () => {
    const user = userEvent.setup();
    const { world } = open([questionView({ options: [] })]);
    await openNeedsYou(userEvent.setup());

    await user.type(
      await screen.findByRole('textbox', { name: 'Your answer' }),
      'Per account',
    );

    world.settleElsewhere('int-q1', 'answer', 'director');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(await screen.findByText(/already settled/)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.getByText(/already settled/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send answer' })).toBeNull();
  });

  it('can always be cancelled, after asking', async () => {
    const user = userEvent.setup();
    const { forge } = open([questionView()]);
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Cancel ticket' }));
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent(/cannot be undone/);

    const confirm = within(dialog).getByRole('button', { name: 'Cancel SVC-4' });

    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(bodyOf(forge)).toEqual({ action: 'cancel' }));
  });
});

describe('Ticket page: failure escalation', () => {
  it.each(FAILURE_CAUSES)(
    'offers the contract actions for %s, every one a working button',
    async (cause) => {
      open([failureView(cause)]);
      await openNeedsYou(userEvent.setup());

      const card = await screen.findByRole('region', {
        name: /^(Held|Stopped|No agent|Another ticket)/,
      });

      const names = within(card)
        .getAllByRole('button')
        .map((button) => button.textContent)
        .filter((name) => name !== 'Add a note for the retry');

      expect(names).toEqual(
        (FAILURE_ACTIONS[cause] ?? []).map((a) =>
          cause === 'merge_conflict' && a in CONFLICT_LABEL
            ? CONFLICT_LABEL[a]
            : LABEL[a],
        ),
      );

      for (const button of within(card).getAllByRole('button')) {
        expect(button).toBeEnabled();
      }
    },
  );

  it('shows the summary and the Director reading, and keeps the attempts one click away', async () => {
    const user = userEvent.setup();
    open([failureView('retry_cap')]);
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', { name: /Stopped/ });

    expect(within(card).getByText(/The ticket stopped/)).toBeInTheDocument();
    expect(within(card).getByText(/missing fixture/)).toBeInTheDocument();

    await user.click(within(card).getByText(/What was tried \(2\)/));

    expect(within(card).getByText('Director retry')).toBeVisible();
  });

  it('retries with an optional note for the Worker', async () => {
    const user = userEvent.setup();
    const { forge } = open([failureView('retry_cap')]);
    await openNeedsYou(userEvent.setup());

    await user.click(
      await screen.findByRole('button', { name: 'Add a note for the retry' }),
    );

    await user.type(
      screen.getByRole('textbox', { name: /Note for the Worker/ }),
      'mind the fixture',
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({ action: 'retry', note: 'mind the fixture' }),
    );
  });

  it('says a retry at the rework cap gives exactly one more attempt', async () => {
    open([failureView('rework_cap')]);
    await openNeedsYou(userEvent.setup());

    expect(await screen.findByText(/exactly one more attempt/)).toBeInTheDocument();
  });

  it('runs a held ticket as Express', async () => {
    const user = userEvent.setup();
    const { forge } = open([failureView('lane_hold')]);
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Run as Express' }));

    await waitFor(() => expect(bodyOf(forge)).toEqual({ action: 'run_as_express' }));
  });

  it('asks for a re-plan comment, says what happens to the tickets, and posts it', async () => {
    const user = userEvent.setup();
    const { forge } = open([failureView('retry_cap')]);
    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Re-plan' }));
    const dialog = await screen.findByRole('dialog');

    expect(dialog).toHaveTextContent(/goes back to planning with your comment/);

    const send = within(dialog).getByRole('button', { name: 'Re-plan SVC-4' });

    expect(send).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox'), 'split the report');
    await user.click(send);

    await waitFor(() =>
      expect(bodyOf(forge)).toEqual({ action: 'replan', comment: 'split the report' }),
    );
  });

  it('lists the dependents when a cancel is refused and offers Cancel all', async () => {
    const user = userEvent.setup();
    const { forge } = open([failureView('retry_cap')], {
      dependents: ['SVC-5', 'SVC-6'],
    });

    await openNeedsYou(userEvent.setup());

    await user.click(await screen.findByRole('button', { name: 'Cancel ticket' }));
    const confirm = within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Cancel SVC-4',
    });

    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    const dialog = await screen.findByRole('alertdialog');

    expect(
      await within(dialog).findByText(/Other tickets are waiting on this one/),
    ).toBeInTheDocument();

    expect(within(dialog).getByRole('link', { name: 'SVC-5' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'SVC-6' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel all' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(ACT).map((call) => call.body)).toEqual([
        { action: 'cancel' },
        { action: 'cancel', cascade: true },
      ]),
    );
  });
});

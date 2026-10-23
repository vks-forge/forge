/**
 * Pins: with nothing waiting no alert is drawn; one waiting item says what it asks and opens in a
 * modal with no stepper; three are listed together in the modal, newest first; Esc closes the
 * modal without answering and the alert can open it again; a press that opens another dialog
 * (Approve plan…) steps the modal aside; when the last item is settled the modal closes itself and
 * the alert goes.
 *
 * Why: the owner's complaint was that two or three alerts left no room to read or write in the
 *   chat. The alert is one slim line however many wait, the decision happens in a modal that
 *   must never trap or lose the keyboard, and a settled item must not leave a modal open over a
 *   page that no longer waits on anything.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   helpers/needs-you-modal, components/work/needs-you-pill, routes/card/use-card-dock.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import {
  dockItem,
  flowDetail,
  flowRoutes,
  FLOW_CARD,
  planFixture,
} from '#tests/helpers/flow-fixtures.js';
import { NO_NEEDS_YOU, openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;

const plan = dockItem('plan_approval', ['approve_plan', 'request_changes'], {
  title: 'Plan v1 needs your approval',
  items: ['Tier C path: packages/core'],
});

const question = dockItem('director_questions', ['answer'], {
  title: 'The Director has a question',
  items: ['Which columns?'],
});

const escalation = dockItem('ticket_escalation', ['answer'], {
  title: 'SVC-4 asks a question',
  ticket_id: 'SVC-4',
  interaction_id: 'int-q1',
});

/** A card whose detail lists `items`; a test ends a wait by emptying `listed.items`. */
function cardWith(items: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  const listed = { items };

  return {
    listed,
    routes: {
      ...flowRoutes({ plan: { versions: [], current: planFixture() } }),
      'GET /cards/:id': () =>
        json(
          flowDetail({
            needs_you: listed.items.length > 0,
            column: listed.items.length > 0 ? 'needs_you' : 'shaping',
            needs_you_detail: listed.items,
          }),
        ),
      ...extra,
    },
  };
}

describe('Card page: needs-you alert', () => {
  it('is not drawn when nothing waits, and the message box is there', async () => {
    renderApp({ path: PAGE, routes: cardWith([]).routes });

    expect(await screen.findByLabelText('Message the Director')).toBeInTheDocument();
    expect(screen.queryByRole('button', NO_NEEDS_YOU)).toBeNull();
  });

  it('says what the one waiting item asks and opens it with no stepper', async () => {
    const user = userEvent.setup();
    renderApp({ path: PAGE, routes: cardWith([plan]).routes });

    expect(await screen.findByText('Needs your approval')).toBeInTheDocument();

    const dock = await openNeedsYou(user, 'Waiting on you (1)');

    expect(within(dock).getByText('Plan v1 needs your approval')).toBeInTheDocument();
    expect(within(dock).queryByText(/1 of 1/)).toBeNull();
    expect(within(dock).queryByRole('button', { name: /waiting item/ })).toBeNull();
  });

  it('lists three items together in the modal, newest first, each with its own actions', async () => {
    const user = userEvent.setup();
    const older = { ...question, raised_at: '2020-10-19T08:00:00.000Z' };
    const newer = { ...escalation, raised_at: '2030-10-19T12:00:00.000Z' };
    renderApp({ path: PAGE, routes: cardWith([older, plan, newer]).routes });

    expect(await screen.findByText('Needs your attention · 3')).toBeInTheDocument();

    const dock = await openNeedsYou(user, 'Waiting on you (3)');

    expect(
      within(dock)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'SVC-4 asks a question',
      'Plan v1 needs your approval',
      'The Director has a question',
    ]);

    expect(within(dock).getByRole('button', { name: 'Approve plan…' })).toBeEnabled();
    expect(
      within(dock).getByRole('link', { name: 'Open the ticket' }),
    ).toBeInTheDocument();
  });

  it('closes on Escape without answering and opens again from the alert', async () => {
    const user = userEvent.setup();
    renderApp({ path: PAGE, routes: cardWith([plan, escalation]).routes });

    await openNeedsYou(user, 'Waiting on you (2)');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Needs your attention · 2')).toBeInTheDocument();
    expect(screen.getByRole('button', NO_NEEDS_YOU)).toHaveFocus();

    const again = await openNeedsYou(user, 'Waiting on you (2)');

    expect(within(again).getByText('Plan v1 needs your approval')).toBeInTheDocument();
  });

  it('steps aside for the approve confirm and leaves the alert for later', async () => {
    const user = userEvent.setup();
    renderApp({ path: PAGE, routes: cardWith([plan, escalation]).routes });

    const dock = await openNeedsYou(user, 'Waiting on you (2)');
    await user.click(within(dock).getByRole('button', { name: 'Approve plan…' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Waiting on you/ })).toBeNull();
  });

  it('closes the modal and drops the alert when the last item is settled', async () => {
    const user = userEvent.setup();
    const world = cardWith([
      dockItem('start_planning', ['start_planning'], {
        title: 'Start planning this card',
      }),
    ]);

    renderApp({
      path: PAGE,
      routes: {
        ...world.routes,
        'POST /cards/:id/start-planning': () => {
          world.listed.items = [];

          return json({});
        },
      },
    });

    const dock = await openNeedsYou(user, 'Waiting on you (1)');
    await user.click(within(dock).getByRole('button', { name: 'Start planning' }));

    await waitFor(() => expect(screen.queryByRole('button', NO_NEEDS_YOU)).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

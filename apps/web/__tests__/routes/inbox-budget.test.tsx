/**
 * Pins: a budget warning is one Inbox row (kind "Budget") that opens the card's Details tab,
 * with Acknowledge (it archives the item) and Change cap (a drawer with the card's cap box,
 * saving through the card patch); an archived warning offers no Acknowledge; and a closed card
 * says its cap cannot change instead of showing a dead box.
 *
 * Why: crossing 80 percent of a card's budget must reach the owner once, and the two honest
 *   answers are "I know" and "warn me at a new number". If Acknowledge did not archive, the
 *   warning would nag; if Change cap sent the owner to another page to find the box, they would
 *   not bother. The warning only warns: nothing here stops the card.
 * Depends on: routes/inbox/*, components/card/budget-cap-field, helpers/render-work.
 */

import type { InboxItem } from '@forge/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import { flowDetail } from '#tests/helpers/flow-fixtures.js';
import { renderWork } from '#tests/helpers/render-work.js';

const INBOX = '/p/sample-service/inbox';
const LIST = 'GET /projects/sample-service/inbox';
const COUNTS = 'GET /projects/sample-service/inbox/counts';
const ID = 'budget_warning:FG-C9:0.8';
const ARCHIVE = `POST /projects/sample-service/inbox/${encodeURIComponent(ID)}/archive`;
const TITLE = 'Card Retry failed webhook sends reached 80% of its budget';

const WARNING: InboxItem = {
  id: ID,
  kind: 'budget_warning',
  project: 'sample-service',
  title: TITLE,
  detail: '$4.20 of $5.00',
  needs_action: true,
  updated_at: '2026-10-16T10:00:00.000Z',
  read: false,
  archived: false,
};

function server(over: { archived?: boolean; card?: Record<string, unknown> } = {}) {
  let archived = over.archived ?? false;
  let cap: number | undefined = 5;

  return {
    [LIST]: () => ({
      body: {
        items: archived && !over.archived ? [] : [{ ...WARNING, archived }],
        nextCursor: null,
      },
    }),
    [COUNTS]: { body: { needs_action: 1, unread: 1, all: 1, archived: 0 } },
    [ARCHIVE]: () => {
      archived = true;

      return { body: { ...WARNING, archived: true } };
    },
    'GET /cards/:id': () =>
      json(
        flowDetail({
          ...(cap === undefined ? {} : { budget_cap_usd: cap }),
          ...over.card,
        }),
      ),
    'PATCH /cards/:id': ({ body }: { body: unknown }) => {
      const next = (body as { budget_cap_usd?: number | null }).budget_cap_usd;
      cap = next ?? undefined;

      return json(flowDetail({ ...(cap === undefined ? {} : { budget_cap_usd: cap }) }));
    },
  };
}

describe('Inbox: budget warning', () => {
  it('is one row of kind Budget that opens the card Details, with the spend in the detail', async () => {
    renderWork(INBOX, server());

    const link = await screen.findByRole('link', { name: `Open card: ${TITLE}` });

    expect(link).toHaveAttribute('href', '/p/sample-service/cards/FG-C9/details');
    expect(screen.getByText('Budget')).toBeVisible();
    expect(screen.getByText(/\$4\.20 of \$5\.00/)).toBeVisible();
  });

  it('archives the item when it is acknowledged, and the row goes', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, server());

    await user.click(
      await screen.findByRole('button', { name: `Acknowledge: ${TITLE}` }),
    );

    await waitFor(() => expect(stub.callsTo(ARCHIVE)).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: `Open card: ${TITLE}` })).toBeNull(),
    );

    expect(await screen.findByText(`Archived “${TITLE}”`)).toBeVisible();
  });

  it('opens the cap box for the card in a drawer and saves a new cap through the card patch', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, server());

    await user.click(await screen.findByRole('button', { name: `Change cap: ${TITLE}` }));

    const drawer = await screen.findByRole('dialog', { name: 'Change the budget cap' });
    const box = await within(drawer).findByLabelText('Budget cap (USD)');

    expect(box).toHaveValue('5');
    expect(
      within(drawer).getByText(/the card keeps working whatever you choose/),
    ).toBeVisible();

    await user.clear(box);
    await user.type(box, '10');
    await user.click(within(drawer).getByRole('button', { name: 'Save cap' }));

    await waitFor(() =>
      expect(stub.callsTo('PATCH /cards/:id')[0]).toMatchObject({
        path: '/cards/FG-C9',
        body: { budget_cap_usd: 10 },
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Change the budget cap' })).toBeNull(),
    );
  });

  it('refreshes the Inbox after the cap changes, since the warning may no longer apply', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, server());

    await user.click(await screen.findByRole('button', { name: `Change cap: ${TITLE}` }));
    const box = await screen.findByLabelText('Budget cap (USD)');
    const before = stub.callsTo(LIST).length;

    await user.clear(box);
    await user.type(box, '50');
    await user.click(screen.getByRole('button', { name: 'Save cap' }));

    await waitFor(() => expect(stub.callsTo(LIST).length).toBeGreaterThan(before));
  });

  it('offers no Acknowledge or Change cap on a warning that is already archived', async () => {
    renderWork(INBOX, server({ archived: true }));

    await screen.findByRole('link', { name: `Open card: ${TITLE}` });

    expect(screen.queryByRole('button', { name: `Acknowledge: ${TITLE}` })).toBeNull();
    expect(screen.queryByRole('button', { name: `Change cap: ${TITLE}` })).toBeNull();
    expect(screen.getByRole('button', { name: `Unarchive: ${TITLE}` })).toBeVisible();
  });

  it('says a closed card cannot change its cap, and Acknowledge still clears the warning', async () => {
    const user = userEvent.setup();
    renderWork(INBOX, server({ card: { closed_reason: 'Done', column: 'closed' } }));

    await user.click(await screen.findByRole('button', { name: `Change cap: ${TITLE}` }));

    expect(
      await screen.findByText(/This card is closed, so its cap cannot change/),
    ).toBeVisible();

    expect(screen.queryByLabelText('Budget cap (USD)')).toBeNull();
    expect(
      screen.getByRole('button', { name: `Acknowledge: ${TITLE}`, hidden: true }),
    ).toBeInTheDocument();
  });

  it('closes the drawer with Escape and changes nothing', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, server());

    await user.click(await screen.findByRole('button', { name: `Change cap: ${TITLE}` }));
    await screen.findByLabelText('Budget cap (USD)');
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Change the budget cap' })).toBeNull(),
    );

    expect(stub.callsTo('PATCH /cards/:id')).toHaveLength(0);
  });
});

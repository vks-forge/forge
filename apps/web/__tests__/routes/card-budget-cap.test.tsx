/**
 * Pins: a card's budget cap is shown on Details ("No cap" when absent, never $0), can be set,
 * changed and cleared in place, is checked before it is sent (a typo is a sentence under the
 * box), says it only warns and never stops the card, and cannot be changed on a closed card.
 *
 * Why: the cap is how an owner asks to be warned about spend, and a "cap" reads as a wall.
 *   Saying "warning only" next to it, refusing nonsense before the server has to, and keeping
 *   an empty box meaning "no cap" (not zero dollars, which would warn at once) keeps the number
 *   honest. The request carries `null` to clear, as the server expects.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   components/card/budget-cap-field, routes/card/tabs/details-tab.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import { flowDetail, flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';

const DETAILS = `/p/sample-service/cards/${FLOW_CARD}/details`;

/** A server that keeps the cap it is given, like the real one. */
function capRoutes(start: number | undefined, over: Record<string, unknown> = {}) {
  let cap = start;

  return {
    ...flowRoutes({ detail: over }),
    'GET /cards/:id': () =>
      json(
        flowDetail({ ...over, ...(cap === undefined ? {} : { budget_cap_usd: cap }) }),
      ),
    'PATCH /cards/:id': ({ body }: { body: unknown }) => {
      const next = (body as { budget_cap_usd?: number | null }).budget_cap_usd;
      cap = next === null || next === undefined ? undefined : next;

      return json(
        flowDetail({ ...over, ...(cap === undefined ? {} : { budget_cap_usd: cap }) }),
      );
    },
  };
}

describe('Card Details: the budget cap', () => {
  it('shows No cap, never $0, and says the cap only warns', async () => {
    renderApp({ path: DETAILS, routes: capRoutes(undefined) });

    expect(await screen.findByText('No cap')).toBeVisible();
    expect(screen.getByText(/Warning only, never stops the card/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Change the budget cap' }),
    ).toHaveTextContent('Set a cap');
  });

  it('sets a cap and shows it', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: DETAILS, routes: capRoutes(undefined) });

    await user.click(
      await screen.findByRole('button', { name: 'Change the budget cap' }),
    );

    await user.type(screen.getByLabelText('Budget cap (USD)'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Save cap' }));

    expect(await screen.findByText('$12.50')).toBeVisible();
    expect(forge.stub.callsTo('PATCH /cards/:id')).toEqual([
      expect.objectContaining({ body: { budget_cap_usd: 12.5 } }),
    ]);
  });

  it('changes a cap, starting from the one in force', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: DETAILS, routes: capRoutes(5) });

    await user.click(
      await screen.findByRole('button', { name: 'Change the budget cap' }),
    );

    const box = screen.getByLabelText('Budget cap (USD)');

    expect(box).toHaveValue('5');

    await user.clear(box);
    await user.type(box, '$20');
    await user.click(screen.getByRole('button', { name: 'Save cap' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('PATCH /cards/:id')[0]).toMatchObject({
        body: { budget_cap_usd: 20 },
      }),
    );
  });

  it('clears the cap with null, from the button or from an empty box', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: DETAILS, routes: capRoutes(5) });

    await user.click(
      await screen.findByRole('button', { name: 'Change the budget cap' }),
    );

    await user.click(screen.getByRole('button', { name: 'Clear cap' }));

    expect(await screen.findByText('No cap')).toBeVisible();
    expect(forge.stub.callsTo('PATCH /cards/:id')[0]).toMatchObject({
      body: { budget_cap_usd: null },
    });
  });

  it('refuses a typo or a negative number in words, before sending anything', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: DETAILS, routes: capRoutes(undefined) });

    await user.click(
      await screen.findByRole('button', { name: 'Change the budget cap' }),
    );

    const box = screen.getByLabelText('Budget cap (USD)');
    await user.type(box, 'lots');

    expect(
      screen.getByText('Enter a number of dollars, or leave it empty.'),
    ).toBeVisible();

    expect(screen.getByRole('button', { name: 'Save cap' })).toBeDisabled();

    await user.clear(box);
    await user.type(box, '-3');

    expect(screen.getByText('A cap cannot be below 0.')).toBeVisible();
    expect(forge.stub.callsTo('PATCH /cards/:id')).toHaveLength(0);
  });

  it('leaves the cap as it was on Cancel and on Escape', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: DETAILS, routes: capRoutes(5) });

    await user.click(
      await screen.findByRole('button', { name: 'Change the budget cap' }),
    );

    await user.type(screen.getByLabelText('Budget cap (USD)'), '9');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('$5.00')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Change the budget cap' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('form', { name: 'Budget cap' })).toBeNull();
    expect(forge.stub.callsTo('PATCH /cards/:id')).toHaveLength(0);
  });

  it('says why when the server refuses a closed card', async () => {
    const user = userEvent.setup();
    renderApp({
      path: DETAILS,
      routes: {
        ...capRoutes(5),
        'PATCH /cards/:id': refusal(409, 'card_closed', 'The card is closed.'),
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Change the budget cap' }),
    );

    await user.type(screen.getByLabelText('Budget cap (USD)'), '1');
    await user.click(screen.getByRole('button', { name: 'Save cap' }));

    const form = await screen.findByRole('form', { name: 'Budget cap' });

    expect(
      await within(form).findByText('This card is closed, so its cap cannot change.'),
    ).toBeVisible();
  });

  it('does not offer to change the cap of a closed card, and says so', async () => {
    renderApp({
      path: DETAILS,
      routes: capRoutes(5, { closed_reason: 'Done elsewhere', column: 'closed' }),
    });

    expect(
      await screen.findByRole('button', { name: 'Change the budget cap' }),
    ).toBeDisabled();

    expect(screen.getByText('A closed card keeps its cap.')).toBeVisible();
  });
});

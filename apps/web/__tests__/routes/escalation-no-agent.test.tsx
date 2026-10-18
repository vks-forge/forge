/**
 * Pins: a ticket whose agent and every fallback could not run waits as "No agent could run this
 * stage", in the owner's words: why (the model is unavailable, or rate limits), every try one click
 * away, and exactly Retry, Re-plan and Cancel ticket as buttons; the engine-only `substitute` is
 * never a button, and once the Director has switched agent the card chat says so in one line with
 * the agent and the reason.
 *
 * Why: this is the end of the fallback chain (retry, fallback list, Director substitute, pause). The
 * owner reaches it when everything automatic failed, so it must say what happened and give a way
 * forward (d-0135); offering a button for the Director's own act, or settling it silently, would
 * confuse who changed the agent that wrote the code.
 * Depends on: components/escalation/*, domain/escalation-copy, domain/card-escalation-lines, the
 * stubbed Forge server via helpers/escalation-world.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld, failureView } from '#tests/helpers/escalation-world.js';
import { flowEvent, flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-4';
const CARD = `/p/sample-service/cards/${FLOW_CARD}`;

function noAgent(family: string, actions: string[] = ['retry', 'replan', 'cancel']) {
  return failureView('no_agent_available', {
    actions,
    payload: {
      kind: 'failure',
      cause: 'no_agent_available',
      summary: 'Implementer could not run this stage on any of its 3 places (anthropic).',
      attempts: [
        { at: new Date().toISOString(), what: 'place 1: claude (opus)', result: family },
        {
          at: new Date().toISOString(),
          what: 'place 2: claude (sonnet)',
          result: family,
        },
      ],
      error_family: family,
      lane: 'standard',
    },
  });
}

describe('No agent could run this stage', () => {
  it('says why when the model is unavailable, and keeps every try one click away', async () => {
    const user = userEvent.setup();
    const world = escalationWorld([noAgent('model_unavailable')]);

    renderApp({ path: TICKET, routes: world.routes });

    const card = await screen.findByRole('region', {
      name: 'No agent could run this stage',
    });

    expect(card).toHaveTextContent('The model it was set to is not available.');
    expect(card).toHaveTextContent('Every place this agent can run was tried');

    await user.click(within(card).getByText(/What was tried \(2\)/));

    expect(within(card).getByText('place 1: claude (opus)')).toBeVisible();
  });

  it('says rate limits when that is what kept refusing', async () => {
    const world = escalationWorld([noAgent('rate_limit')]);

    renderApp({ path: TICKET, routes: world.routes });

    expect(
      await screen.findByText(/The harness kept refusing because of rate limits\./),
    ).toBeVisible();
  });

  it('offers exactly Retry, Re-plan and Cancel ticket, and says what Retry does', async () => {
    const world = escalationWorld([noAgent('rate_limit')]);

    renderApp({ path: TICKET, routes: world.routes });

    const card = await screen.findByRole('region', {
      name: 'No agent could run this stage',
    });

    const names = within(card)
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((name) => name !== 'Add a note for the retry');

    expect(names).toEqual(['Retry', 'Re-plan', 'Cancel ticket']);
    expect(
      within(card).getByText(/starts again from the agent’s first choice/),
    ).toBeVisible();
  });

  it('never draws the Director’s substitute act as a button, even if the server lists it', async () => {
    const world = escalationWorld([
      noAgent('rate_limit', ['substitute', 'retry', 'cancel']),
    ]);

    renderApp({ path: TICKET, routes: world.routes });

    const card = await screen.findByRole('region', {
      name: 'No agent could run this stage',
    });

    expect(within(card).queryByRole('button', { name: /substitute/i })).toBeNull();
    expect(within(card).getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('sends Retry like any other failure', async () => {
    const user = userEvent.setup();
    const world = escalationWorld([noAgent('rate_limit')]);
    const { forge } = renderApp({ path: TICKET, routes: world.routes });

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(forge.stub.callsTo('POST /interactions/:id/act')[0]?.body).toEqual({
        action: 'retry',
      }),
    );
  });
});

describe('The Director switched agent', () => {
  it('says so in the card chat with the agent and the reason', async () => {
    const world = escalationWorld([]);

    renderApp({
      path: CARD,
      routes: {
        ...flowRoutes({
          events: [
            flowEvent(0, 'escalation_settled', {
              interaction_id: 'int-gone',
              ticket_id: 'SVC-4',
              action: 'substitute',
              by: 'director',
              note: 'frontend-writer: it owns the same folders and has a clean record',
            }),
          ],
        }),
        ...world.routes,
      },
    });

    expect(
      await screen.findByText(
        'The Director switched to frontend-writer: it owns the same folders and has a clean record',
      ),
    ).toBeVisible();
  });
});

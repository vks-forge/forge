/**
 * Fixtures for `GET /tickets/:id/consequences`: the plain answer a ticket gets when a test does
 * not stage its own, one per action.
 *
 * Why: Re-plan, Cancel ticket and Merge anyway read their consequence list when their popup
 *   opens, so every test that opens one needs the route to answer. The plain answer lists nothing
 *   special (no held ticket, no dependents, no overruled check), so a test only states what it is
 *   about.
 *
 * Exports: plainConsequences(), consequenceRoutes().
 * Depends on: helpers/fetch-stub.
 */

import { json } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';

type Raw = Record<string, unknown>;

/** The empty, valid answer for `action` on the ticket; `{}` for an action the route does not know. */
export function plainConsequences(action: string, ticketId: string): Raw {
  const ticket = { id: ticketId, title: 'The ticket' };

  if (action === 'replan') {
    return {
      action,
      ticket,
      card_id: null,
      ticket_replaced: true,
      held: [],
      kept: [],
      stop: null,
      mechanical: null,
    };
  }

  if (action === 'cancel') {
    return {
      action,
      ticket,
      run_active: false,
      branch: null,
      has_worktree: false,
      pr_number: null,
      dependents: [],
    };
  }

  return action === 'merge_anyway'
    ? { action, ticket, overruled: [], branch: null, pr_number: null }
    : {};
}

/** The stub route: the staged answer for the action when a test gave one, else the plain answer. */
export function consequenceRoutes(
  staged: Readonly<Partial<Record<string, Raw>>> = {},
): Routes {
  return {
    'GET /tickets/:id/consequences': ({ params, query }) => {
      const action = query.get('action') ?? '';

      return json(staged[action] ?? plainConsequences(action, params['id'] ?? ''));
    },
  };
}

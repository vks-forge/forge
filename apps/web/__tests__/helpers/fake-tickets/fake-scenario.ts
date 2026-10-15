/**
 * `fakeTicketsFor()`: the fake ticket server with instant answers and a scenario switch.
 *
 * Why: tests of the Board and Ticket page need the server's loading-free, deterministic
 *   behaviour, plus on-demand "nothing there" and "cannot reach Forge" worlds, without a
 *   clock or a network. `error` makes every call fail, `empty` shows no tickets.
 *
 * Exports: fakeTicketsFor().
 * Depends on: api/api-error, fake-tickets/fake-tickets-api.
 */

import { ApiError } from '#/api/api-error.js';
import { createFakeTickets } from '#tests/helpers/fake-tickets/fake-tickets-api.js';

export function fakeTicketsFor(scenario: 'ok' | 'empty' | 'error' = 'ok') {
  return createFakeTickets({
    delay: () => Promise.resolve(),
    fail: () => {
      if (scenario === 'error') {
        throw new ApiError('network', 'Cannot reach the Forge server (simulated).');
      }
    },
    streamDelayMs: 0,
    empty: scenario === 'empty',
  });
}

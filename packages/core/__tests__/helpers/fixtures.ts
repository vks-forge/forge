/**
 * Shared test fixtures for @forge/core.
 *
 * Why: state-machine and schema tests need a valid ticket and care about only one or two
 *   fields. One baseline built through the real id constructor and typed by the real
 *   schema means tests cannot pass on a ticket production would reject, and a schema
 *   change breaks the fixture in one place.
 *
 * Exports: T0, makeTicket().
 * Depends on: src/schemas/ticket, src/domain/ids. No IO.
 */

import type { Ticket } from '#/schemas/ticket.js';
import { makeTicketId } from '#/domain/ids.js';

export const T0 = '2026-10-13T00:00:00.000Z';

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: makeTicketId('SF', 1),
    project: 'SF',
    title: 'Add doctor check',
    body: 'body',
    type: 'feat',
    lane: 'express',
    tier_predicted: 'A',
    status: 'inbox',
    status_version: 0,
    rework_count: 0,
    priority: 0,
    created_at: T0,
    updated_at: T0,
    blocked_by: [],
    ...overrides,
  };
}

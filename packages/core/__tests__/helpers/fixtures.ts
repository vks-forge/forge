/**
 * Shared test fixtures for @forge/core.
 *
 * Why: one place for a valid baseline Ticket so tests override only what they care
 *   about (code.md rule 8: shared fixtures live in __tests__/helpers/).
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
    created_at: T0,
    updated_at: T0,
    blocked_by: [],
    ...overrides,
  };
}

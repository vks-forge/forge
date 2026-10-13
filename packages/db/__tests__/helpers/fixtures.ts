/**
 * Shared fixtures for @forge/db tests.
 *
 * Why: the contract and adapter tests need valid baseline rows for every table. Building
 *   them from the core types and schemas means tests cannot pass with rows production
 *   would reject, and a schema change breaks the fixtures in one place.
 *
 * Exports: T0, makeTicket(), makeRun(), makeTextEvent(), makeInteraction(), makeIntake().
 * Depends on: @forge/core. No IO.
 */

import { makeTicketId } from '@forge/core';
import type { IntakeEvent, Interaction, NewRunEvent, Run, Ticket } from '@forge/core';

export const T0 = '2026-10-13T00:00:00.000Z';

export function makeTicket(n = 1, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: makeTicketId('SF', n),
    project: 'SF',
    title: `Ticket ${n}`,
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

export function makeRun(id = 'run-1', overrides: Partial<Run> = {}): Run {
  return {
    id,
    ticket_id: 'SF-1',
    harness: 'fake',
    driver_version: '0.0.0',
    cwd: '/tmp/work',
    lane: 'express',
    started_at: T0,
    status: 'running',
    ...overrides,
  };
}

/** A `text` event as a writer submits it: no `seq`, storage numbers it. */
export function makeTextEvent(text = 't'): NewRunEvent {
  return { type: 'text', ts: T0, text };
}

export function makeInteraction(
  id = 'int-1',
  overrides: Partial<Interaction> = {},
): Interaction {
  return {
    id,
    ticket_id: 'SF-1',
    kind: 'question',
    payload: { prompt: 'which db?' },
    status: 'pending',
    asked_at: T0,
    timeout_at: '2026-10-14T00:00:00.000Z',
    ...overrides,
  };
}

export function makeIntake(
  key = 'k1',
  overrides: Partial<IntakeEvent> = {},
): IntakeEvent {
  return {
    source: 'chat',
    kind: 'new_request',
    dedupe_key: key,
    actor: { type: 'user', id: 'u1' },
    project: 'SF',
    payload: { text: 'hello' },
    received_at: T0,
    ...overrides,
  };
}

/**
 * Builders for the stored facts a history is made from.
 *
 * Why: a history merges card events, questions, runs, stage runs, wakes and gate results; each test
 *   needs a few of them at exact times. One place with defaults keeps the tests about the behaviour
 *   (order, reasons, waits) rather than about filling schemas.
 *
 * Exports: T0, at(), ev(), run(), wake(), stage(), question(), facts().
 * Depends on: src schemas and types (types only).
 */

import type { CardEvent } from '#/schemas/card-event.js';
import type { Interaction } from '#/schemas/interaction.js';
import type { Run } from '#/schemas/run.js';
import type { StageRun } from '#/schemas/stage-run.js';
import type { WakeRequest } from '#/schemas/wake-request.js';
import type { TicketHistoryFacts } from '#/types/history.types.js';

export const T0 = Date.parse('2026-03-01T10:00:00.000Z');

/** An ISO time `sec` seconds after T0. */
export const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();

let seq = 0;

/** A stored card event of the engine (or `actor`) at `sec`. */
export function ev(
  sec: number,
  kind: string,
  payload: Record<string, unknown>,
  actor: { type: string; id: string } = { type: 'director', id: 'engine' },
): CardEvent {
  seq += 1;

  return {
    kind,
    at: at(sec),
    actor,
    payload,
    card_id: 'CARD-1',
    seq,
  } as unknown as CardEvent;
}

export function run(id: string, startSec: number, over: Partial<Run> = {}): Run {
  return {
    id,
    ticket_id: 'CHE-1',
    harness: 'claude',
    started_at: at(startSec),
    status: 'success',
    ...over,
  } as Run;
}

export function wake(
  id: string,
  createdSec: number,
  over: Partial<WakeRequest> = {},
): WakeRequest {
  return {
    id,
    ticket_id: 'CHE-1',
    reason: 'x',
    kind: 'stage',
    status: 'consumed',
    created_at: at(createdSec),
    ...over,
  } as WakeRequest;
}

export function stage(over: Partial<StageRun>): StageRun {
  return {
    id: 1,
    ticket_id: 'CHE-1',
    stage_id: 'review',
    member_id: '',
    cycle: 0,
    kind: 'agent',
    status: 'passed',
    outcome: {},
    started_at: at(0),
    ...over,
  } as StageRun;
}

export function question(
  id: string,
  askedSec: number,
  over: Partial<Interaction> = {},
): Interaction {
  return {
    id,
    ticket_id: 'CHE-1',
    kind: 'question',
    payload: { text: 'Which database?' },
    status: 'pending',
    asked_at: at(askedSec),
    timeout_at: at(askedSec + 3600),
    ...over,
  } as Interaction;
}

export function facts(over: Partial<TicketHistoryFacts> = {}): TicketHistoryFacts {
  return {
    ticketId: 'CHE-1',
    events: [],
    interactions: [],
    runs: [],
    stageRuns: [],
    wakes: [],
    gates: [],
    ...over,
  };
}

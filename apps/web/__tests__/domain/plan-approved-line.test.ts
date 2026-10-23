/**
 * Pins: the "plan approved" line on the card names each created ticket by its id with the plan
 * key as a small label ("CHE-17 (t4)"), and falls back to ids alone on older events.
 *
 * Why: plan keys (t4) and ticket ids (CHE-4) look alike, and after a re-plan they differ (t16 can
 *   be CHE-19). Showing the id first, with the key beside it, keeps the owner and the Director
 *   from mixing them up, which happened when restoring cancelled work.
 * Depends on: src/domain/card-event-lines. No IO.
 */

import { describe, expect, it } from 'vitest';
import { flowLineOf } from '#/domain/card-event-lines.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';
import type { FlowLineContext } from '#/types/cards-ui.types.js';

const approved = (payload: Record<string, unknown>): CardHistoryEvent => ({
  seq: 1,
  kind: 'plan_approved',
  at: '2026-10-23T10:00:00.000Z',
  actor: { type: 'user', id: 'owner' },
  payload,
});

// The approved line reads no context.
const context = {} as FlowLineContext;

describe('plan approved line', () => {
  it('shows each ticket id with its plan key', () => {
    const line = flowLineOf(
      approved({
        version: 2,
        by: 'owner',
        ticket_ids: ['CHE-17', 'CHE-19'],
        plan_keys: ['t4', 't16'],
      }),
      context,
    );

    expect(line?.text).toBe(
      'Plan v2 approved by you: 2 tickets created (CHE-17 (t4), CHE-19 (t16)).',
    );
  });

  it('shows ids alone on an event written before plan keys were recorded', () => {
    const line = flowLineOf(
      approved({ version: 1, by: 'owner', ticket_ids: ['CHE-1'] }),
      context,
    );

    expect(line?.text).toBe('Plan v1 approved by you: 1 ticket created (CHE-1).');
  });
});

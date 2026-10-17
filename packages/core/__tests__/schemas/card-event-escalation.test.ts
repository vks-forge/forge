/**
 * Tests for the card events escalations add.
 *
 * Why: the card chat shows when a ticket's question reached the owner, when it was settled and
 *   by whom (the owner, the Director or an automatic resume), and when a re-plan was asked for.
 *   An `escalation_settled` that could omit who acted would make the chat unable to say "answered
 *   by the Director", which is exactly what the owner needs to be able to trust the Director's
 *   first look. `plan_approved` also records which plan key became which ticket, so a later plan
 *   version can tell what already exists.
 *
 * Pins: the three new kinds parse with their payloads and refuse bad ones; the kinds are listed
 *   in CARD_EVENT_KINDS; `plan_approved` accepts optional `plan_keys`.
 * Depends on: src/schemas/card-event, vitest.
 */

import { describe, expect, it } from 'vitest';
import { CARD_EVENT_KINDS, NewCardEvent } from '#/schemas/card-event.js';

const T = '2026-10-17T00:00:00.000Z';
const base = { at: T, actor: { type: 'director', id: 'engine' } };

describe('escalation card events', () => {
  it('lists the new kinds', () => {
    for (const k of ['escalation', 'escalation_settled', 'replan_requested']) {
      expect(CARD_EVENT_KINDS).toContain(k);
    }
  });

  it('parses an escalation event and refuses an unknown escalation kind', () => {
    const payload = {
      interaction_id: 'int-1',
      ticket_id: 'FG-1',
      escalation_kind: 'failure',
      title: 'Held: Standard lane is not available yet',
    };

    expect(NewCardEvent.safeParse({ ...base, kind: 'escalation', payload }).success).toBe(
      true,
    );

    expect(
      NewCardEvent.safeParse({
        ...base,
        kind: 'escalation',
        payload: { ...payload, escalation_kind: 'rumour' },
      }).success,
    ).toBe(false);
  });

  it('needs who settled it and which action', () => {
    const payload = {
      interaction_id: 'int-1',
      ticket_id: 'FG-1',
      action: 'answer',
      by: 'director',
    };

    expect(
      NewCardEvent.safeParse({ ...base, kind: 'escalation_settled', payload }).success,
    ).toBe(true);

    expect(
      NewCardEvent.safeParse({
        ...base,
        kind: 'escalation_settled',
        payload: { ...payload, by: undefined },
      }).success,
    ).toBe(false);

    expect(
      NewCardEvent.safeParse({
        ...base,
        kind: 'escalation_settled',
        payload: { ...payload, action: 'teleport' },
      }).success,
    ).toBe(false);
  });

  it('parses replan_requested with or without a ticket and needs a comment', () => {
    const payload = { comment: 'split it differently', by: 'owner' };

    expect(
      NewCardEvent.safeParse({ ...base, kind: 'replan_requested', payload }).success,
    ).toBe(true);

    expect(
      NewCardEvent.safeParse({
        ...base,
        kind: 'replan_requested',
        payload: { ...payload, ticket_id: 'FG-3' },
      }).success,
    ).toBe(true);

    expect(
      NewCardEvent.safeParse({
        ...base,
        kind: 'replan_requested',
        payload: { by: 'owner' },
      }).success,
    ).toBe(false);
  });

  it('lets plan_approved carry plan_keys next to ticket_ids', () => {
    const payload = { version: 2, by: 'owner', ticket_ids: ['FG-4'], plan_keys: ['t1'] };

    const parsed = NewCardEvent.parse({ ...base, kind: 'plan_approved', payload });

    expect(parsed.kind === 'plan_approved' && parsed.payload.plan_keys).toEqual(['t1']);
    expect(
      NewCardEvent.safeParse({
        ...base,
        kind: 'plan_approved',
        payload: { version: 2, by: 'owner', ticket_ids: ['FG-4'] },
      }).success,
    ).toBe(true);
  });
});

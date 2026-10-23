/**
 * Tests for the structured Needs you items.
 *
 * Why: the dock on the Card and Ticket pages shows one waiting item at a time and must not
 *   depend on which slice of history the browser loaded, so the server decides what waits on
 *   the owner. A raise that was already settled shown as live, or a live one dropped, leaves
 *   the owner staring at a dead button or never told; an old event without the new fields
 *   must still produce an item the dock can draw.
 *
 * Pins: which newest-first history leaves a raise live, settled or unknown; the legacy
 *   fallback for `kind`, `title` and `items`; escalations becoming items (ticket waits are in
 *   needs-you-ticket.test.ts); a closed card or a card without its flag showing nothing; and properties
 *   (titles stay short, every item has an action).
 * Depends on: src/domain/needs-you, src/schemas/card-event, src/schemas/escalation, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cardNeedsYouItems,
  escalationItem,
  raiseItem,
  scanNeedsYou,
} from '#/domain/needs-you.js';
import type { CardEvent } from '#/schemas/card-event.js';
import { NeedsYouItem } from '#/schemas/needs-you.js';
import type { EscalationView } from '#/schemas/escalation.js';
import type { RaisedEvent } from '#/types/needs-you.types.js';

const AT = '2026-10-19T10:00:00.000Z';
const actor: CardEvent['actor'] = { type: 'director', id: 'engine' };

const raise = (seq: number, payload: Record<string, unknown>): RaisedEvent =>
  ({
    card_id: 'FG-C1',
    seq,
    kind: 'needs_you',
    at: AT,
    actor,
    payload,
  }) as RaisedEvent;

const other = (seq: number, kind: string): CardEvent =>
  ({ card_id: 'FG-C1', seq, kind, at: AT, actor, payload: {} }) as CardEvent;

const view = (over: Partial<EscalationView> & Pick<EscalationView, 'payload'>) =>
  ({
    id: 'int-1',
    ticket_id: 'FG-7',
    ticket_title: 'Add login',
    kind: over.payload.kind,
    stage: 'owner',
    status: 'pending',
    actions: ['answer', 'cancel'],
    asked_at: AT,
    ...over,
  }) as EscalationView;

const question = view({
  payload: {
    kind: 'question',
    text: 'Which provider?',
    source: 'ask_director',
    options: [],
  },
});

describe('scanNeedsYou', () => {
  it('finds the newest raise when nothing after it settled it', () => {
    const events = [other(5, 'step_finished'), raise(4, { reason: 'x' })];

    expect(scanNeedsYou(events)).toMatchObject({ state: 'raised' });
  });

  it.each(['grill_answer', 'plan_approved', 'step_started', 'card_closed'])(
    'reads a raise as settled when %s came after it',
    (kind) => {
      expect(scanNeedsYou([other(5, kind), raise(4, { reason: 'x' })])).toEqual({
        state: 'settled',
      });
    },
  );

  it('says unknown when the events given hold neither a raise nor a settler', () => {
    expect(scanNeedsYou([other(5, 'note')])).toEqual({ state: 'unknown' });
    expect(scanNeedsYou([])).toEqual({ state: 'unknown' });
  });
});

describe('raiseItem', () => {
  it('keeps the structured fields an event carries', () => {
    const item = raiseItem(
      raise(9, {
        reason: 'The plan needs your approval: a; b.',
        actions: ['approve_plan', 'request_changes'],
        kind: 'plan_approval',
        title: 'Approve the plan',
        items: ['a', 'b'],
      }),
    );

    expect(item).toMatchObject({
      kind: 'plan_approval',
      title: 'Approve the plan',
      items: ['a', 'b'],
      seq: 9,
      raised_at: AT,
    });
  });

  it.each([
    [['approve_plan', 'request_changes'], 'plan_approval'],
    [['raise_step_budget', 'retry_step'], 'step_budget'],
    [['answer'], 'director_questions'],
    [['start_planning'], 'start_planning'],
    [['run_as_express'], 'held_ticket'],
  ])('derives the kind of an old event with actions %j as %s', (actions, kind) => {
    const item = raiseItem(raise(2, { reason: 'Old reason.', actions }));

    expect(item.kind).toBe(kind);
    expect(item.items).toEqual(['Old reason.']);
    expect(item.title.length).toBeGreaterThan(0);
  });
});

describe('escalationItem', () => {
  it('turns a Worker question into a ticket escalation item with its text', () => {
    const item = escalationItem(question);

    expect(item).toMatchObject({
      kind: 'ticket_escalation',
      ticket_id: 'FG-7',
      interaction_id: 'int-1',
      items: ['Which provider?'],
      actions: ['answer', 'cancel'],
      seq: null,
    });
  });

  it('calls a held decision a held ticket', () => {
    const held = view({
      payload: {
        kind: 'decision',
        cause: 'findings_hold',
        summary: 'Review found 2 blockers.',
        stage_id: 'review',
        stage_label: 'Review',
        findings: [],
        rework: { count: 2, cap: 2 },
      },
      actions: ['merge_anyway', 'cancel'],
    });

    expect(escalationItem(held)).toMatchObject({
      kind: 'held_ticket',
      items: ['Review found 2 blockers.'],
    });
  });

  it('calls a lane hold a held ticket and a sign-off a sign-off', () => {
    const lane = view({
      payload: {
        kind: 'failure',
        cause: 'lane_hold',
        summary: 'No pipeline serves this lane.',
        attempts: [],
      },
      actions: ['run_as_express', 'cancel'],
    });

    const signOff = view({
      payload: {
        kind: 'sign_off',
        cause: 'tier_c',
        tier: 'C',
        summary: 'Touches auth.',
        checks: {
          passed: 3,
          counts: { critical: 0, high: 0, medium: 0, low: 0 },
          overrides: 0,
        },
      },
      actions: ['sign_off', 'cancel'],
    });

    expect(escalationItem(lane)?.kind).toBe('held_ticket');
    expect(escalationItem(signOff)?.kind).toBe('ticket_signoff');
  });

  it('shows nothing for an escalation the Director still holds or one already settled', () => {
    expect(escalationItem({ ...question, stage: 'director' })).toBeNull();
    expect(escalationItem({ ...question, status: 'answered' })).toBeNull();
    expect(escalationItem({ ...question, actions: [] })).toBeNull();
  });
});

describe('cardNeedsYouItems', () => {
  const live = scanNeedsYou([raise(3, { reason: 'Why.', actions: ['answer'] })]);

  it('lists the card raise first, then escalations', () => {
    const items = cardNeedsYouItems({
      card: { needs_you: true },
      scan: live,
      escalations: [question],
    });

    expect(items.map((i) => i.kind)).toEqual(['director_questions', 'ticket_escalation']);
  });

  it('drops the raise when the card flag is off, but keeps escalations', () => {
    const items = cardNeedsYouItems({
      card: { needs_you: false },
      scan: live,
      escalations: [question],
    });

    expect(items.map((i) => i.kind)).toEqual(['ticket_escalation']);
  });

  it('shows nothing for a closed card', () => {
    expect(
      cardNeedsYouItems({
        card: { needs_you: true, closed_reason: 'done here' },
        scan: live,
        escalations: [question],
      }),
    ).toEqual([]);
  });

  it('drops a raise the history says was settled', () => {
    expect(
      cardNeedsYouItems({
        card: { needs_you: true },
        scan: { state: 'settled' },
        escalations: [],
      }),
    ).toEqual([]);
  });
});

describe('properties', () => {
  it('every item parses, keeps its title short and offers an action', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 300 }),
        fc.array(fc.string({ minLength: 1 }), { maxLength: 6 }),
        (reason, items) => {
          const item = raiseItem(
            raise(1, { reason, actions: ['answer'], title: undefined, items }),
          );

          expect(NeedsYouItem.safeParse(item).success).toBe(true);
          expect(item.title.length).toBeLessThanOrEqual(80);
          expect(item.actions.length).toBeGreaterThan(0);
        },
      ),
    );
  });
});

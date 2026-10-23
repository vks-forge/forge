/**
 * Pins: waiting items are ordered card blockers first then by age; the modal lists them newest
 * first; the alert's words and count follow the items' kinds; each kind offers at most one
 * primary and one secondary action; long reasons become short chips with a disclosure.
 *
 * Why: the owner opens one alert and acts on a list. If the order shifted on refetch, they would
 *   read one item and act on another; if the alert said "sign-off" over a tool approval, they
 *   would open the wrong thing; if an action list grew past two, the item would stop being a
 *   quick decision.
 * Depends on: src/domain/needs-you-dock. No IO.
 */

import type { NeedsYouItem, TicketId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  attentionLabel,
  newestFirst,
  dockActionPlan,
  dockKey,
  orderDockItems,
  reasonChips,
} from '#/domain/needs-you-dock.js';

const tid = (value: string): TicketId => value as TicketId;

const item = (over: Partial<NeedsYouItem>): NeedsYouItem => ({
  kind: 'director_questions',
  title: 'The Director has a question',
  items: [],
  actions: ['answer'],
  raised_at: '2026-10-19T10:00:00.000Z',
  seq: 1,
  ...over,
});

describe('orderDockItems', () => {
  it('puts card blockers before tickets and older before newer', () => {
    const ordered = orderDockItems([
      item({ kind: 'ticket_escalation', raised_at: '2026-10-19T09:00:00.000Z' }),
      item({
        kind: 'ticket_escalation',
        raised_at: '2026-10-19T08:00:00.000Z',
        seq: null,
      }),
      item({ kind: 'plan_approval' }),
      item({ kind: 'director_questions' }),
    ]);

    expect(ordered.map((i) => i.kind)).toEqual([
      'plan_approval',
      'director_questions',
      'ticket_escalation',
      'ticket_escalation',
    ]);

    expect(ordered[2]?.raised_at).toBe('2026-10-19T08:00:00.000Z');
  });

  it('does not change the list it was given', () => {
    const input = [item({ kind: 'ticket_review' }), item({ kind: 'plan_approval' })];

    orderDockItems(input);

    expect(input[0]?.kind).toBe('ticket_review');
  });
});

describe('dockKey', () => {
  it('names an item by its escalation, ticket or event, so it survives a refetch', () => {
    expect(dockKey(item({ interaction_id: 'i-9', ticket_id: tid('FX-1') }))).toBe(
      'director_questions:i-9',
    );

    expect(dockKey(item({ ticket_id: tid('FX-1') }))).toBe('director_questions:FX-1');
    expect(dockKey(item({ seq: 4 }))).toBe('director_questions:4');
  });
});

describe('dockActionPlan', () => {
  it('leads with approval and offers requesting changes second', () => {
    const plan = dockActionPlan(
      item({ kind: 'plan_approval', actions: ['approve_plan', 'request_changes'] }),
      false,
    );

    expect(plan).toEqual({ primary: 'approve_plan', secondary: 'request_changes' });
  });

  it('offers no button for a question: its options and the message box answer it', () => {
    expect(dockActionPlan(item({ kind: 'director_questions' }), false)).toEqual({
      primary: null,
      secondary: null,
    });
  });

  it('retries a step first and links to the budget setting second', () => {
    const plan = dockActionPlan(
      item({ kind: 'step_budget', actions: ['raise_step_budget', 'retry_step'] }),
      false,
    );

    expect(plan).toEqual({ primary: 'retry_step', secondary: 'raise_step_budget' });
  });

  it('shows the live escalation card in the modal with only the way out, else leads with the ticket', () => {
    const escalated = item({
      kind: 'ticket_escalation',
      actions: ['retry'],
      ticket_id: tid('FX-2'),
      interaction_id: 'i-1',
    });

    expect(dockActionPlan(escalated, true)).toEqual({
      primary: null,
      secondary: 'open_ticket',
    });

    expect(dockActionPlan(escalated, false)).toEqual({
      primary: 'open_ticket',
      secondary: null,
    });
  });

  it('runs a held ticket as Express when the raise names it and no card is open', () => {
    const held = item({
      kind: 'held_ticket',
      actions: ['run_as_express'],
      ticket_id: tid('FX-3'),
    });

    expect(dockActionPlan(held, false)).toEqual({
      primary: 'run_as_express',
      secondary: 'open_ticket',
    });
  });

  it('sends finished work to its ticket', () => {
    const review = item({ kind: 'ticket_review', actions: [], ticket_id: tid('FX-4') });

    expect(dockActionPlan(review, false).primary).toBe('open_ticket');
  });
});

describe('reasonChips', () => {
  it('shows up to three chips and needs no disclosure for short ones', () => {
    expect(reasonChips(['Tier C path', 'Unverified claim'])).toEqual({
      chips: ['Tier C path', 'Unverified claim'],
      hidden: 0,
      needsDisclosure: false,
    });
  });

  it('clips long reasons and counts the ones left out', () => {
    const long = 'A floor reason that runs on and on past what a chip can hold';
    const result = reasonChips([long, 'b', 'c', 'd', 'e']);

    expect(result.chips[0]?.endsWith('…')).toBe(true);
    expect(result.chips).toHaveLength(3);
    expect(result.hidden).toBe(2);
    expect(result.needsDisclosure).toBe(true);
  });
});

describe('newestFirst', () => {
  it('lists the most recently raised first and keeps the input as it was', () => {
    const input = [
      { key: 'old', raisedAt: '2026-10-19T08:00:00.000Z' },
      { key: 'new', raisedAt: '2026-10-19T10:00:00.000Z' },
      { key: 'none' },
    ];

    expect(newestFirst(input).map((v) => v.key)).toEqual(['new', 'old', 'none']);
    expect(input[0]?.key).toBe('old');
  });
});

describe('attentionLabel', () => {
  it('names the one ask in its own word', () => {
    expect(attentionLabel(['ticket_signoff'])).toBe('Needs your sign-off');
    expect(attentionLabel(['plan_approval'])).toBe('Needs your approval');
    expect(attentionLabel(['ticket_escalation'])).toBe('Needs your attention');
  });

  it('adds the count when several wait and falls back to the general word', () => {
    expect(attentionLabel(['ticket_signoff', 'ticket_signoff'])).toBe(
      'Needs your sign-off · 2',
    );

    expect(attentionLabel(['ticket_signoff', 'tool_approval', 'held_ticket'])).toBe(
      'Needs your attention · 3',
    );
  });
});

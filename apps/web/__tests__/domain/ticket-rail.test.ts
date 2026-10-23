/**
 * Pins: the ticket rail opens on the review only while one is waiting, old-server questions are
 * told apart from escalated ones, and a scheduler hold is recognised only when nothing else
 * already asks the owner.
 *
 * Why: a rail that opened on Runs while a sign-off waited would hide the evidence for the
 *   decision in the dock, and a hold drawn next to a real item would show Cancel twice.
 * Depends on: domain/ticket-rail.
 */

import type { Interaction } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  defaultTicketRailTab,
  ticketHoldWithoutItem,
  uncoveredInteractions,
} from '#/domain/ticket-rail.js';

const interaction = (id: string): Interaction => ({ id }) as unknown as Interaction;

describe('defaultTicketRailTab', () => {
  it('opens the review while one waits and the runs otherwise', () => {
    expect(defaultTicketRailTab(true)).toBe('review');
    expect(defaultTicketRailTab(false)).toBe('runs');
  });
});

describe('uncoveredInteractions', () => {
  it('keeps only interactions without an escalation of their own', () => {
    const rows = [interaction('a'), interaction('b')];

    expect(uncoveredInteractions(rows, [{ id: 'a' }]).map((row) => row.id)).toEqual([
      'b',
    ]);

    expect(uncoveredInteractions(rows, [])).toHaveLength(2);
    expect(uncoveredInteractions([], [{ id: 'a' }])).toEqual([]);
  });
});

describe('ticketHoldWithoutItem', () => {
  const base = { hasReview: false, ownerItems: 0, legacyQuestions: 0, waitActions: 1 };

  it('is true for a plain hold that offers actions', () => {
    expect(ticketHoldWithoutItem(base)).toBe(true);
  });

  it.each([
    ['a review exists', { hasReview: true }],
    ['an owner item exists', { ownerItems: 1 }],
    ['an old-server question exists', { legacyQuestions: 1 }],
    ['there is nothing to offer', { waitActions: 0 }],
  ])('is false when %s', (_name, over) => {
    expect(ticketHoldWithoutItem({ ...base, ...over })).toBe(false);
  });
});

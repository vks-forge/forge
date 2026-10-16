/**
 * Pins: every card phase has words, a card with no phase says nothing, and dependencies become
 * one chip per card per direction, capped at three with a count for the rest.
 *
 * Why: the card face is read in a second. A phase with no label would print "undefined" on the
 *   Board, a made-up phase for an older server's card would mislead, and a card with twenty
 *   dependencies must not turn one tile into a wall of chips.
 * Depends on: src/domain/card-phase. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_CHIPS,
  PHASE_LABEL,
  dependencyChips,
  phaseLabel,
  phaseLine,
} from '#/domain/card-phase.js';
import { CardPhase } from '#/schemas/cards.js';

describe('phaseLabel', () => {
  it('has words for every phase the server can send', () => {
    for (const phase of CardPhase.options) {
      expect(PHASE_LABEL[phase]).toMatch(/^[A-Z][a-z ]+$/);
    }
  });

  it('says nothing when the server sent no phase', () => {
    expect(phaseLabel({ phase: undefined })).toBeNull();
    expect(phaseLabel({ phase: 'plan_ready' })).toBe('Plan ready');
  });
});

describe('phaseLine', () => {
  const base = {
    open_points: undefined,
    plan_version: undefined,
    ticket_count: 0,
    tickets_done: 0,
  };

  it('adds the one number that matters, and only when the server sent it', () => {
    expect(phaseLine({ ...base, phase: 'grilling', open_points: 3 })).toBe(
      'Grilling · 3 open points',
    );

    expect(phaseLine({ ...base, phase: 'grilling', open_points: 1 })).toBe(
      'Grilling · 1 open point',
    );

    expect(phaseLine({ ...base, phase: 'grilling' })).toBe('Grilling');
    expect(phaseLine({ ...base, phase: 'plan_ready', plan_version: 2 })).toBe(
      'Plan v2 ready',
    );

    expect(phaseLine({ ...base, phase: 'plan_ready' })).toBe('Plan ready');
    expect(
      phaseLine({ ...base, phase: 'in_progress', ticket_count: 7, tickets_done: 4 }),
    ).toBe('4/7 tickets');

    expect(phaseLine({ ...base, phase: 'in_progress' })).toBe('In progress');
    expect(phaseLine({ ...base, phase: undefined })).toBeNull();
  });
});

describe('dependencyChips', () => {
  it('gives no chips to a card with no dependencies', () => {
    expect(dependencyChips({ depends_on: [], blocks: [] })).toEqual([]);
  });

  it('lists what a card waits for before what waits for it', () => {
    const chips = dependencyChips({ depends_on: ['A'], blocks: ['B', 'C'] });

    expect(chips.map((chip) => [chip.direction, chip.id])).toEqual([
      ['blocked_by', 'A'],
      ['blocks', 'B'],
      ['blocks', 'C'],
    ]);
  });

  it('caps each direction and counts the rest', () => {
    const ids = ['A', 'B', 'C', 'D', 'E'];
    const chips = dependencyChips({ depends_on: ids, blocks: [] });

    expect(chips).toHaveLength(MAX_CHIPS + 1);
    expect(chips.at(-1)).toMatchObject({ id: null, more: 2, direction: 'blocked_by' });
  });

  it('gives every chip a distinct key', () => {
    const chips = dependencyChips({ depends_on: ['A', 'B'], blocks: ['A', 'B'] });

    expect(new Set(chips.map((chip) => chip.key)).size).toBe(chips.length);
  });
});

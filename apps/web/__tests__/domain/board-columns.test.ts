/**
 * Pins: every ticket state belongs to exactly one Board column, everything that waits on the
 * user shares the amber column, and filtering and grouping keep every matching ticket once.
 *
 * Why: a state with no column would make tickets vanish from the Board, one in two columns
 *   would show work twice, and a "needs you" ticket outside the amber column would be missed.
 *   Those are the failures a user cannot see coming.
 * Depends on: src/domain/board-columns. Pure.
 */

import { NEEDS_YOU_STATUSES, TicketStatus } from '@forge/core';
import type { TicketSummary } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  BOARD_COLUMNS,
  columnOf,
  EMPTY_FILTER,
  filterTickets,
  groupByColumn,
  isFilterActive,
  STATE_LABEL,
} from '#/domain/board-columns.js';

const ticket = (id: string, over: Partial<TicketSummary> = {}): TicketSummary =>
  ({
    id,
    title: `Title ${id}`,
    state: 'inbox',
    lane: 'express',
    type: 'feat',
    tier_predicted: 'A',
    project: 'p',
    priority: 0,
    rework_count: 0,
    needs_you: false,
    created_at: '2026-10-16T00:00:00.000Z',
    updated_at: '2026-10-16T00:00:00.000Z',
    ...over,
  }) as TicketSummary;

describe('board columns', () => {
  it('puts every state in exactly one column', () => {
    const placed = BOARD_COLUMNS.flatMap((c) => c.states);

    expect([...placed].sort()).toEqual([...TicketStatus.options].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('keeps everything that waits on the user in the amber column', () => {
    for (const state of NEEDS_YOU_STATUSES) {
      expect(columnOf(state)).toBe('needs_you');
    }

    expect(BOARD_COLUMNS.find((c) => c.id === 'needs_you')?.tone).toBe('attn');
    expect(BOARD_COLUMNS.filter((c) => c.tone === 'attn')).toHaveLength(1);
  });

  it('groups blocked with cancelled and inbox with planned', () => {
    expect(columnOf('blocked')).toBe(columnOf('cancelled'));
    expect(columnOf('inbox')).toBe(columnOf('planned'));
    expect(columnOf('in_progress')).toBe('active');
  });

  it('has a plain-language label for every state', () => {
    for (const state of TicketStatus.options) {
      expect(STATE_LABEL[state]).toMatch(/\S/);
    }
  });
});

describe('groupByColumn and filterTickets', () => {
  const tickets = [
    ticket('A-1', { state: 'review', lane: 'full' }),
    ticket('A-2', { state: 'done' }),
    ticket('A-3', { state: 'in_progress', title: 'Fix the exporter' }),
    ticket('A-4', { state: 'blocked' }),
  ];

  it('returns every column, keeps order and loses no ticket', () => {
    const groups = groupByColumn(tickets);

    expect(Object.keys(groups)).toHaveLength(BOARD_COLUMNS.length);
    expect(groups.needs_you.map((t) => t.id)).toEqual(['A-1']);
    expect(groups.closed.map((t) => t.id)).toEqual(['A-4']);
    expect(Object.values(groups).flat()).toHaveLength(tickets.length);
  });

  it('filters by lane, state and text, and they combine', () => {
    expect(filterTickets(tickets, { ...EMPTY_FILTER, lane: 'full' })).toHaveLength(1);
    expect(filterTickets(tickets, { ...EMPTY_FILTER, state: 'done' })[0]?.id).toBe('A-2');
    expect(filterTickets(tickets, { ...EMPTY_FILTER, query: 'EXPORTER' })[0]?.id).toBe(
      'A-3',
    );

    expect(filterTickets(tickets, { ...EMPTY_FILTER, query: 'a-4' })[0]?.id).toBe('A-4');
    expect(
      filterTickets(tickets, { lane: 'full', state: 'done', query: '' }),
    ).toHaveLength(0);
  });

  it('knows when a filter narrows the list', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, query: '  ' })).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, lane: 'full' })).toBe(true);
  });
});

/**
 * Pins: every ticket phase has plain words, only "Waiting for you" is amber, a wait line names
 * the tickets and card it mentions as links, and a `waiting_human` ticket with no open owner item
 * is not in the Needs you column.
 *
 * Why: the owner reads these words to decide where to look. A phase with no label, an amber chip
 * for something that does not need them, or a holder that cannot be clicked sends them to the
 * wrong ticket; a ticket parked on a re-plan that still counts as "Needs you" is the bug that
 * started this (CHE-6, 2026-10-22).
 * Depends on: domain/ticket-phase-copy, domain/board-columns, @forge/core.
 */

import { TicketPhase } from '@forge/core';
import type { TicketWait } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { columnOfTicket, groupByColumn } from '#/domain/board-columns.js';
import {
  PHASE_COPY,
  phaseLabel,
  showsWaitLine,
  splitWaitText,
} from '#/domain/ticket-phase-copy.js';
import { ticketSummary } from '#tests/helpers/work-fixtures.js';

const WORDS: Readonly<Record<TicketPhase, string>> = {
  queued: 'Queued',
  setting_up: 'Setting up',
  waiting_slot: 'Waiting for a slot',
  waiting_deps: 'Waiting on other tickets',
  held_by_plan: 'Held by re-plan',
  paused_quota: 'Paused (quota)',
  backing_off: 'Retrying soon',
  working: 'Working',
  checking: 'Checking',
  waiting_you: 'Waiting for you',
  stuck: 'Needs a look (stuck)',
  done: 'Done',
  cancelled: 'Cancelled',
};

describe('phase copy', () => {
  it.each(TicketPhase.options)('says %s in plain words', (phase) => {
    expect(phaseLabel(phase)).toBe(WORDS[phase]);
  });

  it('has an entry for every phase the server can send, and only one amber', () => {
    expect(Object.keys(PHASE_COPY).sort()).toEqual([...TicketPhase.options].sort());
    expect(
      TicketPhase.options.filter((phase) => PHASE_COPY[phase].tone === 'attn'),
    ).toEqual(['waiting_you']);
  });

  it('shows a reason line only where the chip does not say it all', () => {
    expect(showsWaitLine('waiting_slot')).toBe(true);
    expect(showsWaitLine('held_by_plan')).toBe(true);
    expect(showsWaitLine('stuck')).toBe(true);
    expect(showsWaitLine('working')).toBe(false);
    expect(showsWaitLine('done')).toBe(false);
    expect(showsWaitLine('waiting_you')).toBe(false);
  });
});

describe('splitWaitText', () => {
  const wait = (over: Partial<TicketWait>): TicketWait =>
    ({ phase: 'waiting_slot', text: 'x', ...over }) as TicketWait;

  it('cuts the line at the holder and the card so each is a link', () => {
    const parts = splitWaitText(
      wait({
        text: 'Waiting for a Worker slot (CHE-3 is working) while CHE-C1 re-plans',
        holders: ['CHE-3'] as never,
        card_id: 'CHE-C1' as never,
      }),
    );

    expect(parts).toEqual([
      { kind: 'text', text: 'Waiting for a Worker slot (' },
      { kind: 'ticket', id: 'CHE-3' },
      { kind: 'text', text: ' is working) while ' },
      { kind: 'card', id: 'CHE-C1' },
      { kind: 'text', text: ' re-plans' },
    ]);
  });

  it('does not match an id inside a longer one', () => {
    const parts = splitWaitText(
      wait({ text: 'Waiting on CHE-30', blockers: ['CHE-3'] as never }),
    );

    expect(parts.filter((part) => part.kind === 'ticket')).toEqual([
      { kind: 'ticket', id: 'CHE-3' },
    ]);

    expect(parts.map((part) => ('text' in part ? part.text : part.id)).join('')).toBe(
      'Waiting on CHE-30 (CHE-3)',
    );
  });

  it('returns the text whole when it names nothing', () => {
    expect(splitWaitText(wait({ text: 'Queued: starts when a Worker is free' }))).toEqual(
      [{ kind: 'text', text: 'Queued: starts when a Worker is free' }],
    );
  });
});

describe('Needs you column', () => {
  it('keeps a waiting_human ticket with an open owner item in Needs you', () => {
    expect(
      columnOfTicket(ticketSummary({ state: 'waiting_human', needs_you: true })),
    ).toBe('needs_you');
  });

  it('moves a waiting_human ticket with no open item out of Needs you', () => {
    const held = ticketSummary({ state: 'waiting_human', needs_you: false });

    expect(columnOfTicket(held)).toBe('queue');
    expect(groupByColumn([held]).needs_you).toEqual([]);
  });

  it('leaves review and blocked tickets where their state puts them', () => {
    expect(columnOfTicket(ticketSummary({ state: 'review', needs_you: true }))).toBe(
      'needs_you',
    );

    expect(columnOfTicket(ticketSummary({ state: 'blocked', needs_you: true }))).toBe(
      'needs_you',
    );
  });
});

/**
 * Tests for derivePhase, the one rule that names where a ticket really is.
 *
 * Why: the board used to trust a ticket's status, so a reworked ticket read "In Progress"
 *   while no Worker ran, and a ticket whose owner item was already answered still read
 *   "Needs you". The phase is worked out from plain facts instead; if this table is wrong the
 *   owner is told the wrong thing about their work, or is asked for an answer nobody needs.
 *
 * Pins: one phase per fact combination, owner items winning over the scheduler wait, the
 *   stuck and held-by-plan split of a waiting ticket with no open item, and terminal statuses.
 * Depends on: src/domain/ticket-phase, vitest.
 */

import { describe, expect, it } from 'vitest';
import { derivePhase } from '#/domain/ticket-phase.js';
import type { TicketPhaseFacts } from '#/types/ticket-phase.types.js';

const facts = (over: Partial<TicketPhaseFacts>): TicketPhaseFacts => ({
  status: 'planned',
  liveRun: false,
  setupJob: false,
  checkJob: false,
  openOwnerItems: 0,
  ...over,
});

describe('derivePhase', () => {
  it.each([
    ['status done', { status: 'done' }, 'done'],
    ['status cancelled', { status: 'cancelled' }, 'cancelled'],
    ['a live run', { status: 'in_progress', liveRun: true }, 'working'],
    ['a live check run', { status: 'verifying', liveRun: true }, 'working'],
    ['a check job', { status: 'verifying', checkJob: true }, 'checking'],
    ['a setup job', { status: 'in_progress', setupJob: true }, 'setting_up'],
    ['in progress with nothing running', { status: 'in_progress' }, 'queued'],
    ['verifying with nothing running', { status: 'verifying' }, 'queued'],
    ['a cap wait', { schedulerWait: 'cap' }, 'waiting_slot'],
    ['a deps wait', { schedulerWait: 'deps' }, 'waiting_deps'],
    ['a plan wait', { schedulerWait: 'plan' }, 'held_by_plan'],
    ['a prep wait', { schedulerWait: 'prep' }, 'setting_up'],
    ['a quota wait', { schedulerWait: 'quota' }, 'paused_quota'],
    ['a backoff', { schedulerWait: 'backoff' }, 'backing_off'],
    [
      'a reworked ticket behind a busy slot',
      { status: 'in_progress', schedulerWait: 'cap' },
      'queued',
    ],
    [
      'a new ticket behind a busy slot',
      { status: 'planned', schedulerWait: 'cap' },
      'waiting_slot',
    ],
    [
      'waiting_human with an open owner item',
      { status: 'waiting_human', openOwnerItems: 1 },
      'waiting_you',
    ],
    ['review', { status: 'review' }, 'waiting_you'],
    ['needs_signoff', { status: 'needs_signoff' }, 'waiting_you'],
    ['waiting_human with no item', { status: 'waiting_human' }, 'stuck'],
    [
      'waiting_human with no item, card re-planning',
      { status: 'waiting_human', cardPhase: 'grilling' },
      'held_by_plan',
    ],
    [
      'waiting_human with no item, card in progress',
      { status: 'waiting_human', cardPhase: 'in_progress' },
      'stuck',
    ],
  ] as const)('%s is %s', (_name, over, phase) => {
    expect(derivePhase(facts(over as Partial<TicketPhaseFacts>))).toBe(phase);
  });

  it('lets an open owner item win over a scheduler wait', () => {
    expect(
      derivePhase(
        facts({ status: 'waiting_human', openOwnerItems: 2, schedulerWait: 'cap' }),
      ),
    ).toBe('waiting_you');
  });
});

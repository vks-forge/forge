/**
 * Tests for parking a ticket for a human without a Worker question.
 *
 * Why: lane limits and retry caps hold a ticket for a human even though no Worker ever
 *   asked anything. Faking a dispatch and a question would put false facts in the ticket's
 *   history, so `parked` is its own event, `unparked` is its release (to planned, because
 *   the ticket may never have run), and a blank reason is refused since the reason is the
 *   only thing the human sees.
 *
 *   A ticket parked from Verifying (auth failure, merge conflict, retry cap) has a finished
 *   run, so it must keep rework_count (no gate failed) and resume verifying on release
 *   instead of dispatching a Worker that redoes done work.
 *
 * Pins: parked from planned / in_progress / verifying sets a trimmed blocked_reason; blank
 *   reason and other statuses are rejected; unparked returns to planned, or to verifying
 *   when parked from verifying, and clears the reason and the marker.
 * Depends on: src/domain/state-machine, helpers/fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { transition } from '#/domain/state-machine.js';
import { makeTicket } from '#tests/helpers/fixtures.js';
import { T1, apply } from '#tests/helpers/transition-events.js';

describe('parked / unparked: an honest hold for a human', () => {
  it.each(['planned', 'in_progress'] as const)(
    'parks a %s ticket in waiting_human with a trimmed reason',
    (status) => {
      const t = apply(makeTicket({ status }), {
        type: 'parked',
        at: T1,
        reason: '  lane not enabled  ',
      });

      expect(t.status).toBe('waiting_human');
      expect(t.blocked_reason).toBe('lane not enabled');
    },
  );

  it.each(['', '   '])('rejects a blank reason %j', (reason) => {
    const r = transition(makeTicket({ status: 'planned' }), {
      type: 'parked',
      at: T1,
      reason,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('illegal_transition');
    }
  });

  it.each(['inbox', 'blocked', 'review', 'needs_signoff'] as const)(
    'rejects parking from %s',
    (status) => {
      const r = transition(makeTicket({ status }), {
        type: 'parked',
        at: T1,
        reason: 'x',
      });

      expect(r.ok).toBe(false);
    },
  );

  it('releases a parked ticket back to planned and clears the reason', () => {
    const parked = apply(makeTicket({ status: 'planned' }), {
      type: 'parked',
      at: T1,
      reason: 'x',
    });

    const u = apply(parked, { type: 'unparked', at: T1 });
    expect(u.status).toBe('planned');
    expect('blocked_reason' in u).toBe(true);
    expect(u.blocked_reason).toBeUndefined();
    expect(
      transition(makeTicket({ status: 'in_progress' }), { type: 'unparked', at: T1 }).ok,
    ).toBe(false);
  });

  describe('parked from verifying', () => {
    const verifying = () =>
      makeTicket({ status: 'verifying', rework_count: 1, tier_actual: 'A' });

    it('holds in waiting_human, keeps rework_count and remembers where it came from', () => {
      const t = apply(verifying(), { type: 'parked', at: T1, reason: 'auth failed' });

      expect(t.status).toBe('waiting_human');
      expect(t.blocked_reason).toBe('auth failed');
      expect(t.parked_from).toBe('verifying');
      expect(t.rework_count).toBe(1);
    });

    it('is not remembered when parked from planned or in_progress', () => {
      const t = apply(makeTicket({ status: 'planned' }), {
        type: 'parked',
        at: T1,
        reason: 'x',
      });

      expect(t.parked_from).toBeUndefined();
    });

    it('is released back to verifying with the marker, reason and rework_count settled', () => {
      const parked = apply(verifying(), { type: 'parked', at: T1, reason: 'x' });
      const u = apply(parked, { type: 'unparked', at: T1 });

      expect(u.status).toBe('verifying');
      expect(u.blocked_reason).toBeUndefined();
      expect('parked_from' in u).toBe(true);
      expect(u.parked_from).toBeUndefined();
      expect(u.rework_count).toBe(1);
      expect(u.tier_actual).toBe('A');
    });

    it('does not resume verifying after a block or answer detour clears the marker', () => {
      const parked = apply(verifying(), { type: 'parked', at: T1, reason: 'x' });
      const back = apply(
        parked,
        { type: 'blocked', at: T1, reason: 'dep' },
        { type: 'unblocked', at: T1 },
      );

      expect(back.status).toBe('planned');
      expect(back.parked_from).toBeUndefined();
    });

    it('still needs its own merge precondition after release', () => {
      const parked = apply(
        makeTicket({ status: 'verifying' }),
        { type: 'parked', at: T1, reason: 'x' },
        { type: 'unparked', at: T1 },
      );

      const r = transition(parked, { type: 'merged', at: T1 });
      expect(r.ok).toBe(false);
    });
  });
});

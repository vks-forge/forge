/**
 * Tests for the ticket state machine.
 *
 * Why: ticket status decides who may act and whether work can merge, so a hole here is a
 *   safety hole: a ticket reaching Done without its tier's sign-off, rework looping
 *   forever, or a stale writer winning a CAS race and double-dispatching a ticket.
 *
 * Pins: happy paths Inbox -> Done per tier, tier B/C routing to review/needs_signoff,
 *   purity, block/ask loops, tier-C signer, lane only escalates, errors returned not
 *   thrown, CAS stale version, terminal states and the 2-rework cap (director-core.md
 *   §3-§4, v1-scope-review.md §4.9), and `gate_passed {hold}` (a pipeline with a human stage
 *   sends tier A to review; B stays in review, C stays at needs_signoff).
 *   Properties are in state-machine-properties.test.ts.
 * Depends on: src/domain/state-machine, src/schemas/ticket, helpers/fixtures,
 *   helpers/transition-events, vitest.
 */

import { describe, expect, it } from 'vitest';
import { MAX_AUTO_REWORKS, transition } from '#/domain/state-machine.js';
import { makeTicket } from '#tests/helpers/fixtures.js';
import { T1, apply, ev } from '#tests/helpers/transition-events.js';

describe('transition: happy paths', () => {
  it('walks Inbox to Done for tier A', () => {
    const t = apply(
      makeTicket(),
      ev.triaged,
      ev.dispatched,
      ev.verifying,
      ev.passA,
      ev.merged,
    );

    expect(t.status).toBe('done');
    expect(t.status_version).toBe(5);
    expect(t.tier_actual).toBe('A');
    expect(t.updated_at).toBe(T1);
    expect(t.lane).toBe('standard');
  });

  it('routes tier B to review and C to needs_signoff', () => {
    const base = makeTicket({ status: 'verifying' });
    expect(apply(base, ev.passB).status).toBe('review');
    expect(apply(base, ev.passC).status).toBe('needs_signoff');
  });

  it('sends tier A to review when the pass carries hold, and leaves tiers B and C where they were', () => {
    const base = makeTicket({ status: 'verifying' });
    const hold = (tier: 'A' | 'B' | 'C') =>
      apply(base, { type: 'gate_passed', at: T1, tier_actual: tier, hold: true });

    expect(hold('A')).toMatchObject({ status: 'review', tier_actual: 'A' });
    expect(hold('B').status).toBe('review');
    expect(hold('C').status).toBe('needs_signoff');
    // Without hold, tier A still waits in verifying for the merge event.
    expect(apply(base, ev.passA).status).toBe('verifying');
  });

  it('lets the owner approve tier A work held in review: done, no merge event needed', () => {
    const t = apply(
      makeTicket({ status: 'verifying' }),
      { type: 'gate_passed', at: T1, tier_actual: 'A', hold: true },
      { type: 'done', at: T1 },
    );

    expect(t.status).toBe('done');
  });

  it('does not mutate its input', () => {
    const t = makeTicket();
    const copy = JSON.parse(JSON.stringify(t)) as typeof t;
    transition(t, ev.triaged);
    expect(t).toEqual(copy);
  });

  it('supports blocked/unblocked and ask/answer loops', () => {
    const t = apply(makeTicket({ status: 'in_progress' }), {
      type: 'blocked',
      at: T1,
      reason: 'dep',
    });

    expect(t.status).toBe('blocked');
    expect(t.blocked_reason).toBe('dep');
    const u = apply(t, { type: 'unblocked', at: T1 });
    expect(u.status).toBe('planned');
    expect(u.blocked_reason).toBeUndefined();
    const w = apply(makeTicket({ status: 'in_progress' }), { type: 'asked', at: T1 });
    expect(w.status).toBe('waiting_human');
    expect(apply(w, { type: 'answered', at: T1 }).status).toBe('in_progress');
    expect(apply(w, { type: 'blocked', at: T1, reason: 'timeout' }).status).toBe(
      'blocked',
    );
  });

  it('human sign-off: review and needs_signoff finish via done / rework', () => {
    const review = makeTicket({ status: 'review', tier_actual: 'B' });
    expect(apply(review, { type: 'done', at: T1 }).status).toBe('done');
    expect(apply(review, { type: 'rework', at: T1 }).status).toBe('in_progress');
    const sign = makeTicket({ status: 'needs_signoff', tier_actual: 'C' });
    expect(transition(sign, { type: 'done', at: T1 }).ok).toBe(false);
    expect(apply(sign, { type: 'done', at: T1, signer: 'vikash' }).status).toBe('done');
  });

  it('regate sends finished work back to verifying for a new gate run, dropping the tier', () => {
    const review = makeTicket({ status: 'review', tier_actual: 'B' });
    const back = apply(review, { type: 'regate', at: T1 });
    expect(back.status).toBe('verifying');
    expect(back.tier_actual).toBeUndefined();
    expect(
      apply(makeTicket({ status: 'needs_signoff', tier_actual: 'C' }), {
        type: 'regate',
        at: T1,
      }).status,
    ).toBe('verifying');

    expect(
      transition(makeTicket({ status: 'in_progress' }), { type: 'regate', at: T1 }).ok,
    ).toBe(false);
  });

  it('only escalates lane on triage', () => {
    const t = makeTicket({ lane: 'full' });
    expect(apply(t, ev.triaged).lane).toBe('full');
  });
});

describe('transition: errors never throw', () => {
  it('rejects illegal transitions', () => {
    const r = transition(makeTicket(), ev.dispatched);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('illegal_transition');
    }
  });

  it('rejects merged unless tier A is verified', () => {
    expect(transition(makeTicket({ status: 'verifying' }), ev.merged).ok).toBe(false);
    expect(
      transition(makeTicket({ status: 'verifying', tier_actual: 'B' }), ev.merged).ok,
    ).toBe(false);
  });

  it('rejects any event on a terminal ticket', () => {
    const r = transition(makeTicket({ status: 'done' }), ev.cancelled);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('terminal');
    }
  });

  it('rejects stale expected_version (CAS)', () => {
    const t = makeTicket({ status_version: 3 });
    const r = transition(t, { ...ev.triaged, expected_version: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('stale_version');
    }

    expect(transition(t, { ...ev.triaged, expected_version: 3 }).ok).toBe(true);
  });
});

describe('fresh gate pass per verify cycle', () => {
  it('rejects merged after a failed gate and a re-verify (stale tier_actual)', () => {
    const t = apply(
      makeTicket({ status: 'in_progress' }),
      ev.verifying,
      ev.passA,
      ev.gate_failed,
      ev.verifying,
    );

    expect(t.tier_actual).toBeUndefined();
    const r = transition(t, ev.merged);
    expect(r.ok).toBe(false);
  });

  it('clears tier_actual on gate_failed, verifying and rework', () => {
    const verifyingA = makeTicket({ status: 'verifying', tier_actual: 'A' });
    expect(apply(verifyingA, ev.gate_failed).tier_actual).toBeUndefined();
    const inProgress = makeTicket({ status: 'in_progress', tier_actual: 'B' });
    expect(apply(inProgress, ev.verifying).tier_actual).toBeUndefined();
    const review = makeTicket({ status: 'review', tier_actual: 'B' });
    expect(apply(review, { type: 'rework', at: T1 }).tier_actual).toBeUndefined();
  });
});

describe('explicit clears (storage patches must not leave stale columns)', () => {
  it('emits blocked_reason and tier_actual as present-but-undefined when cleared', () => {
    const blocked = makeTicket({ status: 'blocked', blocked_reason: 'dep' });
    const u = apply(blocked, { type: 'unblocked', at: T1 });
    expect('blocked_reason' in u).toBe(true);
    expect(u.blocked_reason).toBeUndefined();
    const f = apply(
      makeTicket({ status: 'verifying', tier_actual: 'A' }),
      ev.gate_failed,
    );

    expect('tier_actual' in f).toBe(true);
    expect('blocked_reason' in f).toBe(true);
  });
});

describe('tier C signer', () => {
  it.each(['', '   ', String.fromCharCode(32, 9, 10, 32)])(
    'rejects a blank signer %j',
    (signer) => {
      const sign = makeTicket({ status: 'needs_signoff', tier_actual: 'C' });
      expect(transition(sign, { type: 'done', at: T1, signer }).ok).toBe(false);
    },
  );
});

describe('rework cap', () => {
  it('allows two automatic reworks then hands to a human', () => {
    let t = makeTicket({ status: 'verifying' });
    for (let i = 1; i <= MAX_AUTO_REWORKS; i++) {
      t = apply(t, ev.gate_failed);
      expect(t.status).toBe('in_progress');
      expect(t.rework_count).toBe(i);
      t = apply(t, ev.verifying);
    }

    t = apply(t, ev.gate_failed);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toMatch(/rework/);
    expect(t.rework_count).toBe(MAX_AUTO_REWORKS);
  });
});

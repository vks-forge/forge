/**
 * Pins: what a Worker is told when the server parks its call for the owner's approval.
 *
 * Why: a plain "denied" makes a Worker retry or work around the call, which is the bug real
 * approvals fix. An `ask` that carries an interaction id must read as "NOT run, waiting for the
 * owner", tell the Worker to finish the rest and end its turn, exit 2 so the call never runs, and
 * stay short enough for the harness to show whole. An `ask` with no id keeps the old wording.
 *
 * Depends on: src/adapters/claude/hooks/decision-outcome.
 */

import { describe, expect, it } from 'vitest';
import { fromResponse } from '#/adapters/claude/hooks/decision-outcome.js';

const ask = (extra: Record<string, unknown> = {}) => ({
  decision: 'ask' as const,
  reason: 'awaiting_owner',
  receipt_hash: 'ab'.repeat(32),
  ...extra,
});

describe('fromResponse for an ask parked for the owner', () => {
  it('exits 2 and says the call did not run and the owner was asked', () => {
    const r = fromResponse('PreToolUse', ask({ interaction_id: 'int-7' }));

    expect(r.exitCode).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "forge-hook: NOT run, waiting for the owner's approval (int-7): awaiting_owner. " +
        'Do not retry or work around it; do the rest, then end your turn. ' +
        'Forge resumes you with the answer.\n',
    );
  });

  it('caps the message at 500 characters however long the reason is', () => {
    const r = fromResponse(
      'PreToolUse',
      ask({ interaction_id: 'int-7', reason: 'x'.repeat(5000) }),
    );

    expect(r.stderr.length).toBeLessThanOrEqual(500);
    expect(r.stderr).toContain('Forge resumes you with the answer.');
  });

  it('keeps the plain wording for an ask with no interaction id', () => {
    const r = fromResponse('PreToolUse', ask());

    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('needs approval, denied');
  });

  it('keeps the 300-character cap on a plain denial', () => {
    const r = fromResponse('PreToolUse', {
      decision: 'deny',
      reason: 'y'.repeat(400),
      receipt_hash: '',
    });

    expect(r.stderr).toContain('y'.repeat(300));
    expect(r.stderr).not.toContain('y'.repeat(301));
  });
});

/**
 * Tests for how a parked ticket and a failed run are classified.
 *
 * Why: tickets parked before escalations existed carry only a reason text, and the start-up
 *   sweep must give each one the right owner choices from that text alone; a lane hold must
 *   offer "Run as Express", a retry cap must offer "Retry". A run that ends on a login or a
 *   tool approval must raise a setup escalation the owner can fix, not a "Retry" that fails
 *   the same way again. Both rules read the exact reason strings the engine writes, so a
 *   change to those texts must fail here first.
 *
 * Pins: classifyPark for every reason the engine writes today, blocked tickets as question
 *   timeouts, an unknown reason still getting a cause, non-waiting tickets giving null;
 *   setupCauseFor for auth and for each denial reason that a setup can fix.
 * Depends on: src/domain/escalation-classify, vitest.
 */

import { describe, expect, it } from 'vitest';
import { classifyPark, setupCauseFor } from '#/domain/escalation-classify.js';

const park = (status: 'waiting_human' | 'blocked' | 'planned', reason?: string) => ({
  status,
  ...(reason === undefined ? {} : { blocked_reason: reason }),
});

describe('classifyPark', () => {
  it.each([
    ['waiting_human', 'lane not enabled in M0: triage chose standard', 'lane_hold'],
    [
      'waiting_human',
      'pipeline_pending: the standard lane has no pipeline yet. Run it as Express.',
      'lane_hold',
    ],
    ['waiting_human', 'automatic rework cap (2) reached; needs you', 'rework_cap'],
    [
      'waiting_human',
      'gate test failed after 2 automatic reworks; needs you. tests red',
      'rework_cap',
    ],
    [
      'waiting_human',
      'max_turns: the run used all its turns without finishing',
      'max_turns',
    ],
    ['waiting_human', 'refused: the model declined the task', 'refused'],
    ['waiting_human', 'crash: failed 2 times (retry limit 1)', 'retry_cap'],
    ['waiting_human', 'rate_limit: 5 retries used (max 5)', 'retry_cap'],
    [
      'waiting_human',
      're-wake cap (3 per hour) reached after crash; needs a human',
      'rewake_cap',
    ],
    [
      'waiting_human',
      'verify: re-wake cap (3 per hour) reached after crash; needs a human (x)',
      'rewake_cap',
    ],
    ['waiting_human', 'auth: not retried automatically; needs a human', 'not_retried'],
    ['waiting_human', 'cancelled: the run was stopped unexpectedly', 'not_retried'],
    ['blocked', 'question timed out unanswered (int-1)', 'question_timeout'],
    ['waiting_human', 'something nobody planned for', 'not_retried'],
    ['waiting_human', undefined, 'not_retried'],
    ['blocked', undefined, 'question_timeout'],
  ] as const)('%s with "%s" is %s', (status, reason, cause) => {
    expect(classifyPark(park(status, reason))).toMatchObject({ kind: 'failure', cause });
  });

  it('keeps the reason as the summary, clipped', () => {
    const result = classifyPark(park('waiting_human', 'x'.repeat(1000)));

    expect(result?.summary.length).toBeLessThanOrEqual(300);
  });

  it('gives null for a ticket that is not parked', () => {
    expect(classifyPark(park('planned', 'anything'))).toBeNull();
  });
});

describe('setupCauseFor', () => {
  const ctx = {
    harness_id: 'claude-code',
    harness_kind: 'claude',
    version: '2.1.0',
  } as const;

  const deny = (reason: string, tool = 'shell') => ({
    tool,
    reason,
    decision: 'deny' as const,
    version: null,
  });

  it('turns an auth failure into a login setup for the run harness', () => {
    expect(setupCauseFor('auth', [], ctx)).toEqual({
      type: 'login',
      harness_id: 'claude-code',
    });
  });

  it.each([
    'unknown_tool',
    'quarantined',
    'schema_pending',
    'schema_changed',
    'schema_denied',
    'not_granted',
    'unattended',
  ])('turns a policy denial for %s into a tool setup', (reason) => {
    expect(setupCauseFor('policy_denied', [deny(reason, 'webfetch')], ctx)).toEqual({
      type: 'tool',
      tool: 'webfetch',
      harness_kind: 'claude',
      version: '2.1.0',
      reason_code: reason,
    });
  });

  it('uses the version recorded on the receipt when there is one', () => {
    expect(
      setupCauseFor(
        'policy_denied',
        [{ ...deny('schema_changed'), version: '2.0.9' }],
        ctx,
      ),
    ).toMatchObject({ version: '2.0.9' });
  });

  it('takes the latest matching denial', () => {
    expect(
      setupCauseFor(
        'policy_denied',
        [deny('not_granted', 'old'), deny('unknown_tool', 'newest')],
        ctx,
      ),
    ).toMatchObject({ tool: 'newest' });
  });

  it('gives null for denials a setup cannot fix and for other families', () => {
    expect(setupCauseFor('policy_denied', [deny('rule_deny')], ctx)).toBeNull();
    expect(setupCauseFor('policy_denied', [], ctx)).toBeNull();
    expect(setupCauseFor('crash', [deny('unknown_tool')], ctx)).toBeNull();
    expect(
      setupCauseFor(
        'policy_denied',
        [{ ...deny('unknown_tool'), decision: 'allow' as const }],
        ctx,
      ),
    ).toBeNull();
  });
});

/**
 * Tests for the owner's actions on a setup escalation.
 *
 * Why: a setup wait must never be a dead end (d-0135), and the two kinds of setup problem are
 *   fixed differently. A signed-out harness or an unapproved tool is fixed outside Forge and then
 *   re-checked; a failed worktree setup (an install step that stopped) can be tried again, skipped
 *   so the Worker starts without the packages, or cancelled (d-0180). Offering "I fixed it" for a
 *   failed install would check nothing, and offering "retry" for a signed-out harness would send
 *   the Worker straight back into the same denial.
 *
 * Pins: recheck and cancel for login, tool and harness-build setups; retry, skip setup and cancel
 *   for a failed worktree setup, in button order; replan never offered for either.
 * Depends on: src/domain/escalation-actions, src/schemas/escalation-setup, helpers/escalation-payloads, vitest.
 */

import { describe, expect, it } from 'vitest';
import { escalationActions } from '#/domain/escalation-actions.js';
import type { EscalationPayload } from '#/schemas/escalation.js';
import type { SetupCause } from '#/schemas/escalation-setup.js';
import { worktreeSetupCause } from '#tests/helpers/escalation-payloads.js';

const setup = (cause: SetupCause): EscalationPayload => ({
  kind: 'setup',
  cause,
  summary: 'fix it',
  fix_href: '/settings',
});

const fixedOutside: SetupCause[] = [
  { type: 'login', harness_id: 'claude-code' },
  {
    type: 'tool',
    tool: 'read',
    harness_kind: 'claude',
    version: '1.0.0',
    reason_code: 'schema_pending',
  },
  { type: 'harness_build', harness_kind: 'claude', version: '1.0.1' },
];

describe('setup escalation actions', () => {
  it.each(fixedOutside)(
    'offers recheck and cancel for a %j problem fixed outside Forge',
    (cause) => {
      expect(escalationActions(setup(cause), { replannable: true })).toEqual([
        'recheck',
        'cancel',
      ]);
    },
  );

  it('offers retry, start without setup and cancel for a failed worktree setup', () => {
    expect(escalationActions(setup(worktreeSetupCause), { replannable: true })).toEqual([
      'retry',
      'skip_setup',
      'cancel',
    ]);
  });
});

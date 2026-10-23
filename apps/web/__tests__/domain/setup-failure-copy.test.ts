/**
 * Pins: the words of the "Forge could not get the workspace ready" card: a title that names the
 * ticket, a hint that tells a missing tool from a timeout from an error to read, a printed tail cut
 * to its last lines, and a settled line for the automatic retry after the owner edited the steps.
 *
 * Why: an owner who is not a programmer decides from these sentences whether to install a tool,
 *   edit a step or skip setup. They must be right for any language (the command is data, never a
 *   Node default, d-0176), must say nothing was spent, and a new setup cause, action or settled
 *   path without a sentence would reach the owner as an enum value.
 * Depends on: domain/setup-failure-copy, domain/escalation-copy, schemas/escalation,
 *   helpers/setup-views.
 */

import { describe, expect, it } from 'vitest';
import {
  ACTION_LABEL,
  escalationTitle,
  settledLine,
  settledWords,
} from '#/domain/escalation-copy.js';
import {
  setupFailureHint,
  setupFailureLead,
  setupFailureTitle,
  SETUP_SETTLED_AUTO,
  tailLinesOf,
} from '#/domain/setup-failure-copy.js';
import { ESCALATION_ACTIONS, EscalationView } from '#/schemas/escalation.js';
import type { WorktreeSetupCause } from '#/types/escalation-ui.types.js';
import { worktreeSetupView } from '#tests/helpers/setup-views.js';

const causeOf = (over: Record<string, unknown> = {}): WorktreeSetupCause => {
  const view = EscalationView.parse(worktreeSetupView(over));
  const { payload } = view;

  if (payload.kind !== 'setup' || payload.cause.type !== 'worktree_setup') {
    throw new Error('not a worktree setup');
  }

  return payload.cause;
};

describe('worktree setup copy', () => {
  it('titles the card with the ticket id', () => {
    expect(escalationTitle(EscalationView.parse(worktreeSetupView()))).toBe(
      'Forge could not get SVC-4’s workspace ready',
    );

    expect(setupFailureTitle()).toBe('Forge could not get the workspace ready');
  });

  it('says nothing was spent, and says it ran out of time when it did', () => {
    expect(setupFailureLead(causeOf()).after).toMatch(/nothing was spent/);
    expect(setupFailureLead(causeOf({ timed_out: true })).after).toMatch(
      /ran out of time/,
    );
  });

  it('hints at a missing tool, naming the first word of whatever command the step has', () => {
    expect(setupFailureHint(causeOf({ exit_code: 127 }))).toBe(
      'This computer does not have uv, or Forge cannot find it. Install it, or change the setup step.',
    );

    expect(
      setupFailureHint(
        causeOf({
          command: 'cargo fetch --locked',
          exit_code: 1,
          tail: 'cargo: command not found',
        }),
      ),
    ).toMatch(/does not have cargo/);

    expect(setupFailureHint(causeOf({ exit_code: null }))).toMatch(/does not have uv/);
  });

  it('hints at the time limit for a timeout, and at the printed lines for anything else', () => {
    expect(setupFailureHint(causeOf({ timed_out: true, exit_code: null }))).toMatch(
      /time limit/,
    );

    expect(setupFailureHint(causeOf())).toBe('The last lines it printed are below.');
  });

  it('keeps the last 40 lines of what the step printed and nothing for no output', () => {
    const many = Array.from({ length: 100 }, (_v, i) => 'line ' + String(i + 1)).join(
      '\n',
    );

    const kept = tailLinesOf(many + '\n\n');

    expect(kept).toHaveLength(40);
    expect(kept[0]).toBe('line 61');
    expect(kept.at(-1)).toBe('line 100');
    expect(tailLinesOf('  \n')).toEqual([]);
  });

  it('has a sentence for the new action and for the automatic retry', () => {
    expect(ESCALATION_ACTIONS).toContain('skip_setup');
    expect(ACTION_LABEL.skip_setup).toBe('Start without setup');
    expect(settledWords('skip_setup', 'owner')).toBe('Started without setup by you');
    expect(settledWords('retry', 'auto')).toBe('Resumed by itself once it was fixed');
    expect(settledWords('retry', 'auto', true)).toBe(SETUP_SETTLED_AUTO);
  });

  it('words the settled line of an automatic retry only for a setup that failed', () => {
    const at = '2026-10-21T11:58:00.000Z';
    const now = Date.parse('2026-10-21T12:00:00.000Z');
    const setup = EscalationView.parse(worktreeSetupView()).payload;
    const login = EscalationView.parse({
      ...worktreeSetupView(),
      payload: {
        kind: 'setup',
        cause: { type: 'login', harness_id: 'claude-code' },
        summary: 'x',
        fix_href: '/settings',
      },
    }).payload;

    expect(settledLine({ action: 'retry', by: 'auto', at }, now, setup)).toBe(
      'Setup steps changed; trying again · 2 min ago',
    );

    expect(settledLine({ action: 'recheck', by: 'auto', at }, now, login)).toMatch(
      /by itself/,
    );
  });
});

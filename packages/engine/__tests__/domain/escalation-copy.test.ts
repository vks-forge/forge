/**
 * Tests for the plain-words texts and links the engine writes into an escalation.
 *
 * Why: the owner reads these lines on the card chat and the Inbox, so they must say what is wrong
 *   in words, not codes ("Held: the Standard lane is not available yet", not "lane_hold"), and a
 *   setup escalation must link to the screen that fixes it or the owner cannot act. A link that
 *   pointed at the wrong settings page would send the owner away from the fix.
 *
 * Pins: a title for every failure cause, decision cause (a provenance hold says Forge cannot prove who changed the files), setup cause and a clipped question text; the summary of
 *   each setup cause; the settings link of each setup cause (harness page, with the tools anchor
 *   for tools and builds, project page for grants).
 * Depends on: src/domain/escalation-copy, @forge/core, vitest.
 */

import { DecisionCause, FailureCause } from '@forge/core';
import type { EscalationPayload } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { fixHrefFor, setupSummary, titleOf } from '#/domain/escalation-copy.js';

const failure = (cause: FailureCause): EscalationPayload => ({
  kind: 'failure',
  cause,
  summary: 's',
  attempts: [],
});

describe('titleOf', () => {
  it.each(FailureCause.options)('has a plain title for the %s failure', (cause) => {
    const title = titleOf(failure(cause));

    expect(title.length).toBeGreaterThan(8);
    expect(title).not.toContain('_');
  });

  it.each(DecisionCause.options)(
    'has a plain "Held:" title for the %s decision',
    (cause) => {
      const title = titleOf({
        kind: 'decision',
        cause,
        summary: 's',
        stage_id: 'g1',
        stage_label: 'G1',
        findings: [],
        rework: { count: 0, cap: 2 },
      });

      expect(title).toMatch(/^Held: /);
      expect(title).not.toContain('_');
    },
  );

  it('says in words that Forge cannot prove who changed the files of a provenance hold', () => {
    expect(
      titleOf({
        kind: 'decision',
        cause: 'provenance_hold',
        summary: 's',
        stage_id: 'g1',
        stage_label: 'G1',
        findings: [],
        rework: { count: 2, cap: 2 },
      }),
    ).toBe('Held: Forge cannot prove who changed these files');
  });

  it('says a lane hold in words', () => {
    expect(titleOf(failure('lane_hold'))).toBe(
      'Held: the lane goes live in the next update',
    );
  });

  it('uses the question text, clipped to one line', () => {
    const title = titleOf({
      kind: 'question',
      text: `Which database?\n${'x'.repeat(300)}`,
      source: 'ask_director',
      options: [],
    });

    expect(title.startsWith('Which database?')).toBe(true);
    expect(title).not.toContain('\n');
    expect(title.length).toBeLessThanOrEqual(120);
  });

  it('names the setup', () => {
    expect(
      titleOf({
        kind: 'setup',
        cause: { type: 'login', harness_id: 'claude-code' },
        summary: 's',
        fix_href: '/x',
      }),
    ).toBe('Sign in to claude-code again');
  });
});

describe('setupSummary and fixHrefFor', () => {
  const tool = {
    type: 'tool',
    tool: 'webfetch',
    harness_kind: 'claude',
    version: '2.1.0',
    reason_code: 'schema_pending',
  } as const;

  it('explains each cause in a sentence', () => {
    expect(setupSummary({ type: 'login', harness_id: 'claude-code' })).toContain(
      'signed out',
    );

    expect(setupSummary(tool)).toContain('webfetch');
    expect(setupSummary(tool)).toContain('approve');
    expect(setupSummary({ ...tool, reason_code: 'not_granted' })).toContain('grant');

    expect(
      setupSummary({ type: 'harness_build', harness_kind: 'claude', version: '2.1.1' }),
    ).toBe(
      'Claude Code updated to 2.1.1. Approve its tools in Settings → Harnesses → Claude Code; the ticket resumes by itself.',
    );
  });

  it('links a login to its harness page and a tool or build to the tools section', () => {
    expect(
      fixHrefFor({ type: 'login', harness_id: 'claude-code' }, 'forge', 'claude-code'),
    ).toBe('/settings/harnesses/claude-code');

    expect(fixHrefFor(tool, 'forge', 'claude-code')).toBe(
      '/settings/harnesses/claude-code#tools',
    );

    expect(
      fixHrefFor(
        { type: 'harness_build', harness_kind: 'claude', version: '2.1.1' },
        'forge',
        'claude-code',
      ),
    ).toBe('/settings/harnesses/claude-code#tools');
  });

  it('words a failed worktree setup with one hint: a missing tool, a timeout, or the output', () => {
    const cause = {
      type: 'worktree_setup',
      step: 'Install packages',
      command: 'pnpm install --frozen-lockfile',
      exit_code: 1,
      timed_out: false,
      tail: 'ERR_PNPM_OUTDATED_LOCKFILE',
      settings_version: 3,
    } as const;

    expect(setupSummary(cause)).toContain('nothing was spent');
    expect(setupSummary(cause)).toContain(
      'The last lines it printed are in the details.',
    );

    expect(setupSummary({ ...cause, exit_code: null })).toContain(
      'does not have pnpm, or Forge cannot find it',
    );

    expect(
      setupSummary({ ...cause, exit_code: 1, tail: 'pnpm: command not found' }),
    ).toContain('does not have pnpm');

    expect(setupSummary({ ...cause, timed_out: true })).toContain('ran too long');
    expect(fixHrefFor(cause, 'forge', 'claude-code')).toBe(
      '/p/forge/settings/checks#setup',
    );
  });

  it('links a missing grant to the project settings', () => {
    expect(
      fixHrefFor({ ...tool, reason_code: 'not_granted' }, 'forge', 'claude-code'),
    ).toBe('/p/forge/settings');

    expect(
      fixHrefFor({ ...tool, reason_code: 'unattended' }, 'forge', 'claude-code'),
    ).toBe('/p/forge/settings');
  });
});

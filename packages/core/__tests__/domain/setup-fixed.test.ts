/**
 * Tests for `isSetupFixed`, the cheap check that a setup escalation has been fixed.
 *
 * Why: a setup escalation resumes by itself once the owner fixed the cause, and "I fixed it,
 *   check again" must answer honestly. Resuming on a stale fact would send the Worker straight
 *   back into the same denial; never resuming would leave the owner clicking. The check only
 *   reads facts Forge already stores (no probe runs), and it only triggers a retry: the next
 *   run still passes `admit()`.
 *
 * Pins: a login is fixed by a harness that tested ok after the escalation, not by an older ok;
 *   a schema denial by an approved tool-schema row, an unknown tool by a catalogue entry, a
 *   missing grant by the project grant; a harness build by a passing compatibility check.
 * Depends on: src/domain/setup-fixed, vitest.
 */

import { describe, expect, it } from 'vitest';
import { isSetupFixed } from '#/domain/setup-fixed.js';
import type { SetupCause } from '#/schemas/escalation-setup.js';

const ASKED = '2026-10-17T10:00:00.000Z';
const BEFORE = '2026-10-17T09:00:00.000Z';
const AFTER = '2026-10-17T11:00:00.000Z';

const tool = (reason_code: string): SetupCause => ({
  type: 'tool',
  tool: 'webfetch',
  harness_kind: 'claude',
  version: '2.1.0',
  reason_code,
});

describe('isSetupFixed', () => {
  const login: SetupCause = { type: 'login', harness_id: 'claude-code' };

  it('needs the harness to test ok after the escalation was raised', () => {
    const ok = (last_checked_at?: string, status = 'ok' as const) => ({
      harness: { status, ...(last_checked_at ? { last_checked_at } : {}) },
    });

    expect(isSetupFixed(login, ok(AFTER), ASKED)).toBe(true);
    expect(isSetupFixed(login, ok(BEFORE), ASKED)).toBe(false);
    expect(isSetupFixed(login, ok(), ASKED)).toBe(false);
    expect(isSetupFixed(login, ok(AFTER, 'error' as never), ASKED)).toBe(false);
    expect(isSetupFixed(login, {}, ASKED)).toBe(false);
  });

  it.each(['schema_pending', 'schema_changed', 'schema_denied'])(
    'is fixed for %s once the tool schema is approved',
    (reason) => {
      expect(
        isSetupFixed(tool(reason), { toolSchema: { status: 'approved' } }, ASKED),
      ).toBe(true);

      expect(
        isSetupFixed(tool(reason), { toolSchema: { status: 'pending' } }, ASKED),
      ).toBe(false);

      expect(
        isSetupFixed(tool(reason), { toolSchema: { status: 'denied' } }, ASKED),
      ).toBe(false);

      expect(isSetupFixed(tool(reason), { catalogued: true, granted: true }, ASKED)).toBe(
        false,
      );
    },
  );

  it.each(['unknown_tool', 'quarantined'])(
    'is fixed for %s once the catalogue lists the tool',
    (reason) => {
      expect(isSetupFixed(tool(reason), { catalogued: true }, ASKED)).toBe(true);
      expect(isSetupFixed(tool(reason), { catalogued: false }, ASKED)).toBe(false);
      expect(isSetupFixed(tool(reason), {}, ASKED)).toBe(false);
    },
  );

  it.each(['not_granted', 'unattended'])(
    'is fixed for %s once the project grant lists the tool',
    (reason) => {
      expect(isSetupFixed(tool(reason), { granted: true }, ASKED)).toBe(true);
      expect(isSetupFixed(tool(reason), { granted: false }, ASKED)).toBe(false);
    },
  );

  it('is not fixed for a reason it does not know', () => {
    expect(
      isSetupFixed(tool('rule_deny'), { catalogued: true, granted: true }, ASKED),
    ).toBe(false);
  });

  it('is fixed for a harness build once its compatibility check passes', () => {
    const cause: SetupCause = {
      type: 'harness_build',
      harness_kind: 'claude',
      version: '2.1.1',
    };

    expect(isSetupFixed(cause, { build: { compat: 'pass' } }, ASKED)).toBe(true);
    expect(
      isSetupFixed(cause, { build: { compat: 'pass', pending_tools: 0 } }, ASKED),
    ).toBe(true);

    expect(
      isSetupFixed(cause, { build: { compat: 'pass', pending_tools: 2 } }, ASKED),
    ).toBe(false);

    expect(isSetupFixed(cause, { build: { compat: 'fail' } }, ASKED)).toBe(false);
    expect(isSetupFixed(cause, { build: { compat: 'pending' } }, ASKED)).toBe(false);
    expect(isSetupFixed(cause, {}, ASKED)).toBe(false);
  });

  it('is fixed for a failed worktree setup only once the settings moved past the version it saw', () => {
    const cause: SetupCause = {
      type: 'worktree_setup',
      step: 'Install packages',
      command: 'npm ci',
      exit_code: 1,
      timed_out: false,
      tail: 'boom',
      settings_version: 4,
    };

    expect(isSetupFixed(cause, { setup_version: 5 }, ASKED)).toBe(true);
    expect(isSetupFixed(cause, { setup_version: 4 }, ASKED)).toBe(false);
    expect(isSetupFixed(cause, {}, ASKED)).toBe(false);
  });
});

/**
 * Tests for isRunActive.
 *
 * Why: the hook handler and the Forge MCP server both decide "may this run still act?"
 *   from the run row. If they disagreed (one treating a `starting` run as dead, the other
 *   accepting a settled one) a finished run could still get receipts and state writes, or
 *   a booting run could be locked out of its own MCP server. One rule keeps them equal
 *   (execution-plane.md §8).
 *
 * Pins: starting and running without ended_at are active; every other status, and any
 *   run with ended_at, is not.
 * Depends on: src/domain/run-active, src/schemas/run, vitest.
 */

import { describe, expect, it } from 'vitest';
import { isRunActive } from '#/domain/run-active.js';
import { RunStatus } from '#/schemas/run.js';

const T = '2026-10-13T01:00:00.000Z';

describe('isRunActive', () => {
  it.each(['starting', 'running'] as const)('%s without ended_at is active', (status) => {
    expect(isRunActive({ status })).toBe(true);
  });

  it.each(RunStatus.options.filter((s) => s !== 'starting' && s !== 'running'))(
    '%s is not active',
    (status) => {
      expect(isRunActive({ status })).toBe(false);
    },
  );

  it.each(['starting', 'running'] as const)(
    'a %s run that has ended_at is not active (never reopened)',
    (status) => {
      expect(isRunActive({ status, ended_at: T })).toBe(false);
    },
  );
});

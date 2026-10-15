/**
 * Tests for the HarnessState schema.
 *
 * Why: dispatch trusts a `harness_state` row to decide whether a harness may start runs.
 *   A row with an unreadable time or an empty reason would either park a harness forever
 *   (no run ever starts) or hide why tickets are waiting, so the row is validated on every
 *   read and write.
 *
 * Pins: a valid row parses; a bad timestamp, an empty reason and an unsafe harness id are
 *   rejected.
 * Depends on: src/schemas/harness-state, vitest.
 */

import { describe, expect, it } from 'vitest';
import { HarnessState } from '#/schemas/harness-state.js';

const ok = {
  harness_id: 'claude-code',
  paused_until: '2026-10-15T14:20:00.000Z',
  reason: 'The Claude account has no available quota.',
  updated_at: '2026-10-15T13:20:00.000Z',
};

describe('HarnessState', () => {
  it('parses a valid pause', () => {
    expect(HarnessState.parse(ok)).toEqual(ok);
  });

  it.each([
    ['a bad timestamp', { ...ok, paused_until: 'tomorrow' }],
    ['an empty reason', { ...ok, reason: '' }],
    ['an unsafe harness id', { ...ok, harness_id: '../x' }],
  ])('rejects %s', (_name, row) => {
    expect(HarnessState.safeParse(row).success).toBe(false);
  });
});

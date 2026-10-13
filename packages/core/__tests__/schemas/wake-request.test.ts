/**
 * Tests for the wake request schema.
 *
 * Why: The engine tick wakes tickets from `wake_requests`. A row with an unknown kind or an empty idempotency key would break the (ticket, reason, key) dedupe that stops a done run being re-woken forever (director-core.md §3).
 *
 * Pins: WakeRequest parses pending and consumed rows and rejects unknown kinds, statuses and negative coalesced counts; NewWakeRequest omits storage-owned fields.
 * Depends on: src/schemas/wake-request, vitest.
 */

import { describe, expect, it } from 'vitest';
import { NewWakeRequest, WakeRequest } from '#/schemas/wake-request.js';

const ts = '2026-10-13T00:00:00.000Z';

describe('WakeRequest', () => {
  const wake = {
    id: 'w1',
    ticket_id: 'SF-1',
    reason: 'gate_failed',
    kind: 'retry',
    idempotency_key: 'k1',
    coalesced_count: 0,
    status: 'pending',
    created_at: ts,
  };

  it('parses a pending wake, with optional not_before and consumed_at', () => {
    expect(WakeRequest.safeParse(wake).success).toBe(true);
    expect(
      WakeRequest.safeParse({
        ...wake,
        not_before: ts,
        consumed_at: ts,
        status: 'consumed',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown kinds, statuses and an empty idempotency key', () => {
    expect(WakeRequest.safeParse({ ...wake, kind: 'nap' }).success).toBe(false);
    expect(WakeRequest.safeParse({ ...wake, status: 'done' }).success).toBe(false);
    expect(WakeRequest.safeParse({ ...wake, idempotency_key: '' }).success).toBe(false);
    expect(WakeRequest.safeParse({ ...wake, coalesced_count: -1 }).success).toBe(false);
  });

  it('NewWakeRequest has no storage-owned fields', () => {
    expect(Object.keys(NewWakeRequest.shape)).not.toContain('coalesced_count');
    expect(Object.keys(NewWakeRequest.shape)).not.toContain('status');
    expect(Object.keys(NewWakeRequest.shape)).not.toContain('consumed_at');
  });
});

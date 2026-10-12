/**
 * Tests for the IntakeEvent schema.
 *
 * Why: intake dedupe is the first line of idempotency for triggers (d-0002).
 *
 * Pins: a chat event parses, unknown sources and empty dedupe keys are rejected,
 *   idempotency key is `source:dedupe_key` (director-core.md §7).
 * Depends on: src/schemas/intake, vitest.
 */

import { describe, expect, it } from 'vitest';
import { IntakeEvent, intakeIdempotencyKey } from '#/schemas/intake.js';

const ev = {
  source: 'chat',
  kind: 'new_request',
  dedupe_key: 'msg-1',
  actor: { type: 'user', id: 'vikash' },
  project: 'SF',
  payload: { text: 'hi' },
  received_at: '2026-10-13T00:00:00.000Z',
};

describe('IntakeEvent', () => {
  it('parses a chat event', () => {
    expect(IntakeEvent.safeParse(ev).success).toBe(true);
  });

  it('accepts other sources in the enum but rejects unknown ones', () => {
    expect(IntakeEvent.safeParse({ ...ev, source: 'cron' }).success).toBe(true);
    expect(IntakeEvent.safeParse({ ...ev, source: 'fax' }).success).toBe(false);
  });

  it('rejects an empty dedupe key', () => {
    expect(IntakeEvent.safeParse({ ...ev, dedupe_key: '' }).success).toBe(false);
  });

  it('builds a stable idempotency key from source + dedupe_key', () => {
    const parsed = IntakeEvent.parse(ev);
    expect(intakeIdempotencyKey(parsed)).toBe('chat:msg-1');
  });
});

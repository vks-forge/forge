/**
 * Tests for the IntakeEvent schema.
 *
 * Why: dedupe is the first defence against redelivered chat messages and webhooks
 *   creating duplicate tickets. Unknown sources or empty keys would let un-dedupable
 *   events through, and a key not scoped to its source would let two sources suppress
 *   each other's events (d-0002, director-core.md §7).
 *
 * Pins: a chat event parses, github_issue and author are accepted, unknown sources and empty dedupe keys are rejected,
 *   idempotency key is `source:dedupe_key` (director-core.md §7).
 * Depends on: src/schemas/intake, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  IntakeEvent,
  StoredIntakeEvent,
  intakeIdempotencyKey,
} from '#/schemas/intake.js';

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

  it('accepts the github_issue source and an optional author for the allow-list', () => {
    const parsed = IntakeEvent.parse({
      ...ev,
      source: 'github_issue',
      author: { kind: 'github', login: 'octocat' },
    });

    expect(parsed.author).toEqual({ kind: 'github', login: 'octocat' });
    expect(IntakeEvent.parse(ev).author).toBeUndefined();
    expect(IntakeEvent.safeParse({ ...ev, author: { kind: 'robot' } }).success).toBe(
      false,
    );
  });

  it('rejects an empty dedupe key', () => {
    expect(IntakeEvent.safeParse({ ...ev, dedupe_key: '' }).success).toBe(false);
  });

  it('builds a stable idempotency key from source + dedupe_key', () => {
    const parsed = IntakeEvent.parse(ev);
    expect(intakeIdempotencyKey(parsed)).toBe('chat:msg-1');
  });
});

const ts = '2026-10-13T00:00:00.000Z';

describe('StoredIntakeEvent', () => {
  const stored = {
    id: 7,
    source: 'chat',
    kind: 'new_request',
    dedupe_key: 'k',
    actor: { type: 'user', id: 'u' },
    project: 'SF',
    payload: { a: 1 },
    received_at: ts,
  };

  it('is an intake event plus the stored id and the optional mapped ticket', () => {
    expect(StoredIntakeEvent.safeParse(stored).success).toBe(true);
    expect(StoredIntakeEvent.safeParse({ ...stored, ticket_id: 'SF-3' }).success).toBe(
      true,
    );

    expect(StoredIntakeEvent.safeParse({ ...stored, id: 0 }).success).toBe(false);
  });
});

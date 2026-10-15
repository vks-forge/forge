/**
 * Tests for the RunEvent kinds added in ports batch C.
 *
 * Why: run events are replayed to rebuild what a Worker did. If a new event kind failed to
 *   parse, or an unknown kind slipped through, replay would drop or invent history.
 *
 * Pins: RunEvent kinds (batch C item 7).
 * Depends on: src/schemas/run, vitest.
 */

import { describe, expect, it } from 'vitest';
import { RunEvent, InteractionKind } from '#/schemas/run.js';

const ts = '2026-10-13T00:00:00.000Z';

describe('RunEvent kinds (batch C item 7)', () => {
  it('parses permission, inbox_delivered, session and hook_liveness', () => {
    const events = [
      { type: 'permission', seq: 0, ts, call_id: 'c1', tool: 'shell', decision: 'ask' },
      {
        type: 'permission',
        seq: 1,
        ts,
        interaction_id: 'i1',
        call_id: 'c1',
        tool: 'shell',
        decision: 'allow',
      },
      { type: 'inbox_delivered', seq: 2, ts, inbox_seq: 0, mode: 'steer' },
      { type: 'session', seq: 3, ts, session_ref: 'sess-1' },
      {
        type: 'user_message',
        seq: 5,
        ts,
        inbox_seq: 0,
        mode: 'steer',
        author: 'vikash',
        text: 'use v2',
      },
      { type: 'hook_liveness', seq: 4, ts, fingerprint: 'f'.repeat(16) },
    ];

    for (const e of events) {
      expect(RunEvent.safeParse(e).success).toBe(true);
    }
  });

  it('rejects malformed new events', () => {
    expect(
      RunEvent.safeParse({
        type: 'permission',
        seq: 0,
        ts,
        call_id: 'c',
        tool: 't',
        decision: 'maybe',
      }).success,
    ).toBe(false);

    expect(
      RunEvent.safeParse({
        type: 'inbox_delivered',
        seq: 0,
        ts,
        inbox_seq: 0,
        mode: 'shout',
      }).success,
    ).toBe(false);

    expect(
      RunEvent.safeParse({ type: 'session', seq: 0, ts, session_ref: '' }).success,
    ).toBe(false);
  });

  it('InteractionKind gains blocked, and the ask event carries it', () => {
    expect(InteractionKind.safeParse('blocked').success).toBe(true);
    const ask = {
      type: 'ask',
      seq: 0,
      ts,
      interaction_id: 'i',
      kind: 'blocked',
      prompt: 'x',
    };

    expect(RunEvent.safeParse(ask).success).toBe(true);
  });
});

/**
 * Tests for the run inbox schema.
 *
 * Why: Steering messages wait in `run_inbox` until a driver delivers them. A message with an unknown mode or a caller-chosen seq could be delivered in the wrong way or collide with another writer (director-core.md §8).
 *
 * Pins: RunInboxMessage parses delivered and undelivered rows and rejects unknown modes, negative seq and empty text; NewRunInboxMessage omits seq and delivered_at.
 * Depends on: src/schemas/run-inbox, vitest.
 */

import { describe, expect, it } from 'vitest';
import { NewRunInboxMessage, RunInboxMessage } from '#/schemas/run-inbox.js';

const ts = '2026-10-13T00:00:00.000Z';

describe('RunInboxMessage', () => {
  const msg = { run_id: 'r1', seq: 0, mode: 'steer', author: 'user', text: 'stop' };

  it('parses a message, delivered or not', () => {
    expect(RunInboxMessage.safeParse(msg).success).toBe(true);
    expect(RunInboxMessage.safeParse({ ...msg, delivered_at: ts }).success).toBe(true);
  });

  it('rejects an unknown mode, a negative seq and empty text', () => {
    expect(RunInboxMessage.safeParse({ ...msg, mode: 'yell' }).success).toBe(false);
    expect(RunInboxMessage.safeParse({ ...msg, seq: -1 }).success).toBe(false);
    expect(RunInboxMessage.safeParse({ ...msg, text: '' }).success).toBe(false);
  });

  it('NewRunInboxMessage has no seq or delivered_at (storage numbers it)', () => {
    expect(Object.keys(NewRunInboxMessage.shape).sort()).toEqual([
      'author',
      'mode',
      'run_id',
      'text',
    ]);
  });
});

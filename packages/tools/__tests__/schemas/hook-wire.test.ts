/**
 * Pins: hook wire payloads seen in probes 2 and 5 parse, unknown fields survive, bad ones fail.
 *
 * Why: the Forge server must reject what it does not understand instead of admitting it,
 * and the hook client and server must agree on one request/response shape.
 *
 * Depends on: src/schemas/hook-wire.
 */

import { describe, expect, it } from 'vitest';
import { HookPayload, HookRequest, HookResponse } from '#/schemas/hook-wire.js';

const payloads = [
  { hook_event_name: 'SessionStart', source: 'startup' },
  { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'x' } },
  { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: {} },
  { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'boom' },
];

describe('hook wire schemas', () => {
  it('parses each event and keeps unknown fields', () => {
    for (const p of payloads) {
      expect(HookPayload.parse({ ...p, future_field: 1 })).toHaveProperty(
        'future_field',
        1,
      );
    }
  });

  it('defaults tool_input and rejects a missing tool_name', () => {
    const p = HookPayload.parse({ hook_event_name: 'PreToolUse', tool_name: 'Bash' });
    expect(p).toMatchObject({ tool_input: {} });
    expect(HookPayload.safeParse({ hook_event_name: 'PreToolUse' }).success).toBe(false);
    expect(HookPayload.safeParse({ hook_event_name: 'Stop' }).success).toBe(false);
  });

  it('validates request and response', () => {
    const ok = { event: 'PreToolUse', payload: payloads[1], seq: 3 };
    expect(HookRequest.safeParse(ok).success).toBe(true);
    expect(HookRequest.safeParse({ ...ok, event: 'PostToolUse' }).success).toBe(false);
    expect(
      HookResponse.safeParse({ decision: 'maybe', reason: '', receipt_hash: '' }).success,
    ).toBe(false);
    expect(
      HookResponse.safeParse({ decision: 'deny', reason: 'r', receipt_hash: '' }).success,
    ).toBe(true);
  });
});

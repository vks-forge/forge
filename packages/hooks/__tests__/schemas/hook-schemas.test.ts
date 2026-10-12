/**
 * Pins: payload shapes seen in probes 2 and 5 parse, unknown fields survive, bad ones fail.
 *
 * Why: the hook must reject what it does not understand instead of forwarding it.
 *
 * Depends on: src/schemas.
 */

import { describe, expect, it } from 'vitest';
import { HookConfig, HookPayload, HookRequest, HookResponse } from '#/index.js';
import { failure, post, pre, sessionStart } from '#tests/helpers/fixtures.js';

describe('hook schemas', () => {
  it('parses each event and keeps unknown fields', () => {
    for (const p of [sessionStart(), pre(), post(), failure()]) {
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

  it('validates request, response and config', () => {
    const ok = { event: 'PreToolUse', payload: pre(), seq: 3 };
    expect(HookRequest.safeParse(ok).success).toBe(true);
    expect(HookRequest.safeParse({ ...ok, event: 'PostToolUse' }).success).toBe(false);
    expect(
      HookResponse.safeParse({ decision: 'maybe', reason: '', receipt_hash: '' }).success,
    ).toBe(false);
    const cfg = {
      run_id: 'r',
      server_url: 'http://127.0.0.1:1',
      token: 't',
      timeout_ms: 1,
    };
    expect(HookConfig.safeParse(cfg).success).toBe(true);
    expect(HookConfig.safeParse({ ...cfg, server_url: 'nope' }).success).toBe(false);
  });
});

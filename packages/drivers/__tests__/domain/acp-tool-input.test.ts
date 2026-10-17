/**
 * Pins: an ACP tool call announced with an empty input keeps the input that arrives later.
 *
 * Why: the ACP adapter announces a call the moment the model starts writing it (`rawInput`
 * `{}`) and sends the real input in a `tool_call_update`. Live run 2 stored every call with
 * `input: {}`, so the thread could not show which file or command a call touched. The
 * normaliser must carry that input as an update event on the same call id, and must not
 * invent one for updates that carry none.
 *
 * Depends on: src/domain/acp-events. Pure.
 */

import { describe, expect, it } from 'vitest';
import { normaliseAcpUpdate } from '#/domain/acp-events.js';

describe('normaliseAcpUpdate: late tool input', () => {
  it('carries a tool input that arrives after an empty announcement (recorded ACP sequence)', () => {
    const call = normaliseAcpUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      title: 'Write',
      status: 'pending',
      rawInput: {},
    });

    const pending = normaliseAcpUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'in_progress',
      rawInput: { file_path: '/w/a.ts', content: 'x' },
    });

    const noInput = normaliseAcpUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'in_progress',
    });

    const done = normaliseAcpUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      rawInput: { file_path: '/w/a.ts', content: 'x' },
      rawOutput: 'ok',
    });

    expect(call.events).toEqual([
      { type: 'tool_call', call_id: 't1', name: 'Write', input: {} },
    ]);

    expect(pending.events).toEqual([
      {
        type: 'tool_call_update',
        call_id: 't1',
        input: { file_path: '/w/a.ts', content: 'x' },
      },
    ]);

    expect(noInput.events).toEqual([]);
    expect(done.events.map((e) => e.type)).toEqual(['tool_call_update', 'tool_result']);
  });
});

/**
 * Tracks which tool calls still owe a decision receipt check, and which never will.
 *
 * Why: the supervisor must prove every call the harness made went through the hook, but
 *   three shapes of call break the naive "check on announcement" rule. ACP announces a call
 *   with an empty input and sends the real one later, so the check waits for the call to
 *   resolve (and uses the input that arrived in between). Claude Code can also reject a call
 *   in its own validation (`<tool_use_error>`) before PreToolUse runs: that call never ran,
 *   so no receipt is owed, while a call that ran (or failed any other way) still needs one.
 *   Keeping this bookkeeping apart leaves the supervisor to decide what a missing receipt
 *   means for the run.
 *
 * Exports: createCallTracker().
 * Depends on: domain/call-input, types/claude/engine. No IO.
 */

import { hasInput, isHarnessRejection } from '#/domain/call-input.js';
import type { CallTracker } from '#/types/claude/call-tracker.types.js';
import type { ToolCallRef } from '#/types/claude/engine.types.js';

export function createCallTracker(
  enabled: boolean,
  check: (call: ToolCallRef) => void,
): CallTracker {
  const seen = new Set<string>();
  const rejected = new Set<string>();
  // Calls announced with a still-streaming input (ACP sends `{}`): checked once they resolve.
  const deferred = new Map<string, ToolCallRef>();

  return {
    onEvent(e) {
      if (e.type === 'tool_call' && enabled && !seen.has(e.call_id)) {
        seen.add(e.call_id);
        const ref = { id: e.call_id, name: e.name, input: e.input };
        if (hasInput(e.input)) {
          check(ref);
        } else {
          deferred.set(e.call_id, ref);
        }
      } else if (e.type === 'tool_call_update') {
        const ref = deferred.get(e.call_id);
        if (ref && hasInput(e.input)) {
          deferred.set(e.call_id, { ...ref, input: e.input });
        }
      } else if (e.type === 'tool_result') {
        const ref = deferred.get(e.call_id);
        deferred.delete(e.call_id);
        if (isHarnessRejection(e.output, e.is_error)) {
          rejected.add(e.call_id);
        }

        if (ref && !rejected.has(e.call_id)) {
          check(ref);
        }
      }
    },
    isRejected: (id) => rejected.has(id),
    unresolved: () => [...deferred.values()],
    clear: () => deferred.clear(),
  };
}

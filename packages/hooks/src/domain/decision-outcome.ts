/**
 * Decision to exit-code mapping for the hook script.
 *
 * Why: the harness only understands exit codes: 2 blocks the tool call and shows stderr
 *   to the Worker, 0 lets it run. Everything the server may say, and everything that can
 *   go wrong on the way to hearing it, must collapse to one of those two so that no
 *   failure of ours ever reads as permission. PreToolUse is the only hard gate: Claude Code
 *   treats SessionStart as non-blocking (exit 2 only shows stderr), so a SessionStart that
 *   exits 2 does not stop the session; the engine's liveness check and the next PreToolUse
 *   do. After the fact (PostToolUse*) nothing can be undone, so the hook only reports
 *   (d-0033, probe 2).
 *
 * Exports: isBlockingEvent(), fromResponse(), failClosed().
 * Depends on: schemas/hook-payload, schemas/hook-wire, types/hook-client. No IO.
 */

import type { HookEventName } from '#/schemas/hook-payload.js';
import type { HookResponse } from '#/schemas/hook-wire.js';
import type { HookResult } from '#/types/hook-client.types.js';

/** Events whose failure must stop the Worker. Anything unknown counts as blocking. */
export function isBlockingEvent(event: string | undefined): boolean {
  return event !== 'PostToolUse' && event !== 'PostToolUseFailure';
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 300);

/** Result for a failure of the hook itself: blocks on blocking events, logs on the rest. */
export function failClosed(event: string | undefined, code: string): HookResult {
  const blocking = isBlockingEvent(event);
  const label = blocking ? 'fail-closed' : 'not recorded';
  return {
    exitCode: blocking ? 2 : 0,
    stdout: '',
    stderr: `forge-hook: ${label}: ${oneLine(code)}\n`,
  };
}

/**
 * Result for a well-formed server answer. Plain exit 2 with the reason on stderr is what
 * probe 2 measured as honoured (the harness reports `PreToolUse:<Tool> hook error:
 * [cmd]: <stderr>` to the model), so no `hookSpecificOutput` JSON is emitted.
 */
export function fromResponse(event: HookEventName, res: HookResponse): HookResult {
  if (res.decision === 'allow') return { exitCode: 0, stdout: '', stderr: '' };
  const receipt = res.receipt_hash ? ` [receipt ${res.receipt_hash.slice(0, 12)}]` : '';
  const verb = res.decision === 'ask' ? 'needs approval, denied' : 'denied';
  const stderr = `forge-hook: ${verb}: ${oneLine(res.reason)}${receipt}\n`;
  return { exitCode: isBlockingEvent(event) ? 2 : 0, stdout: '', stderr };
}

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
 *   An `ask` the server parked for the owner (it carries an `interaction_id`) is worded differently:
 *   the Worker must learn that the call did NOT run, that the owner has been asked, and that
 *   it should finish what does not need the call and end its turn, because Forge resumes the
 *   same session with the answer. A plain "denied" would make it retry or work around the
 *   call (d-0175, execution-plane.md §6).
 *
 * Exports: isBlockingEvent(), fromResponse(), failClosed().
 * Depends on: @forge/tools/hook-wire, types/claude/hook-client. No IO.
 */

import type { HookEventName, HookResponse } from '@forge/tools/hook-wire';
import type { HookResult } from '#/types/claude/hook-client.types.js';

/** Events whose failure must stop the Worker. Anything unknown counts as blocking. */
export function isBlockingEvent(event: string | undefined): boolean {
  return event !== 'PostToolUse' && event !== 'PostToolUseFailure';
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 300);

/** The owner-approval message is longer than a plain refusal, so it has its own cap. */
const APPROVAL_MESSAGE_MAX = 500;

/** What the Worker is told when its call was parked for the owner's approval. */
function awaitingOwner(res: HookResponse & { interaction_id: string }): string {
  const tail =
    '. Do not retry or work around it; do the rest, then end your turn. Forge resumes you with the answer.';

  const head = `forge-hook: NOT run, waiting for the owner's approval (${res.interaction_id}): `;
  const room = Math.max(0, APPROVAL_MESSAGE_MAX - head.length - tail.length - 1);

  return `${head}${res.reason.replace(/\s+/g, ' ').trim().slice(0, room)}${tail}\n`;
}

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
  if (res.decision === 'allow') {
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  if (res.decision === 'ask' && res.interaction_id !== undefined) {
    return {
      exitCode: isBlockingEvent(event) ? 2 : 0,
      stdout: '',
      stderr: awaitingOwner({ ...res, interaction_id: res.interaction_id }),
    };
  }

  const receipt = res.receipt_hash ? ` [receipt ${res.receipt_hash.slice(0, 12)}]` : '';
  const verb = res.decision === 'ask' ? 'needs approval, denied' : 'denied';
  const stderr = `forge-hook: ${verb}: ${oneLine(res.reason)}${receipt}\n`;

  return { exitCode: isBlockingEvent(event) ? 2 : 0, stdout: '', stderr };
}

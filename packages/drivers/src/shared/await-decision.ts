/**
 * Waits for the server-side decision receipt of one tool call.
 *
 * Why: the hook records a signed decision before a tool runs, but the supervisor sees the
 *   call from the harness stream, possibly a moment earlier. It polls the receipt chain
 *   until the receipt shows up, the grace window passes, or the run settles, so a slow hook
 *   is not mistaken for a bypassed one while a real bypass still ends in `null`.
 *
 * Exports: awaitDecision().
 * Depends on: @forge/tools (digest, Decision), types/claude/await-decision, types/claude/engine.
 *   IO: reads receipts through the injected port; timers through the injected clock.
 */

import { canonicalJson, sha256Hex } from '@forge/tools';
import type { Decision } from '@forge/tools';
import type { AwaitDecisionArgs } from '#/types/claude/await-decision.types.js';
import type { ToolCallRef } from '#/types/claude/engine.types.js';

const POLL_MS = 200;

/** The decision for `call`, or null when none appeared in time. */
export async function awaitDecision(
  a: AwaitDecisionArgs,
  call: ToolCallRef,
): Promise<Decision | null> {
  const match = {
    name: call.name,
    argsHash: sha256Hex(canonicalJson(call.input ?? null)),
  };

  const deadline = a.clock.now() + a.graceMs;
  for (;;) {
    let found: Decision | null = null;
    try {
      found = await a.receipts.decisionFor(a.runId, call.id, match);
    } catch (e) {
      a.log('warn', 'receipt lookup failed', { error: String(e), call: call.id });
    }

    const left = deadline - a.clock.now();
    if (found || left <= 0 || a.settling()) {
      return found;
    }

    await new Promise<void>((resolve) => a.clock.after(Math.min(POLL_MS, left), resolve));
  }
}

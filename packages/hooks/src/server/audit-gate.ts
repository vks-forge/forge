/**
 * Rate-limited audit sink for refused hook requests.
 *
 * Why: a Worker that can reach the hook endpoint can post bad tokens forever. Writing an
 *   HMAC'd receipt for each would let it bloat and lengthen the run's signed chain, which
 *   the gates must verify. Refusals therefore go to a side channel (never the chain), at
 *   most one entry per run per window, with a count of what was dropped, so a guessing
 *   attack stays visible to the operator without costing anything.
 *
 * Exports: createAuditGate(), createMemoryAudit(), AUDIT_WINDOW_MS.
 * Depends on: types/hook-handler.types. No IO.
 */

import type { AuditEntry, HookAudit } from '#/types/hook-handler.types.js';

export const AUDIT_WINDOW_MS = 10_000;
const MEMORY_CAP = 200;

/** Wraps `sink` so each run emits at most one entry per window; the rest are counted. */
export function createAuditGate(
  sink: HookAudit,
  clock: () => Date,
): (runId: string, code: AuditEntry['code']) => Promise<void> {
  const state = new Map<string, { last: number; suppressed: number }>();
  return async (runId, code) => {
    const at = clock().getTime();
    const s = state.get(runId);
    if (s && at - s.last < AUDIT_WINDOW_MS) {
      s.suppressed += 1;
      return;
    }
    state.set(runId, { last: at, suppressed: 0 });
    await sink(runId, {
      ts: new Date(at).toISOString(),
      code,
      suppressed: s?.suppressed ?? 0,
    });
  };
}

/** Default sink: keeps the most recent entries in memory so they can be inspected in-process. */
export function createMemoryAudit(): {
  readonly sink: HookAudit;
  readonly entries: readonly { runId: string; entry: AuditEntry }[];
} {
  const entries: { runId: string; entry: AuditEntry }[] = [];
  const sink: HookAudit = (runId, entry) => {
    entries.push({ runId, entry });
    if (entries.length > MEMORY_CAP) entries.shift();
  };
  return { sink, entries };
}

/**
 * Agent fallback — the next place a stage runs when its agent's current one fails.
 *
 * Why: a run fails for reasons that say nothing about the work: the model is rate-limited past its retries,
 *   or gone altogether. The owner listed where else the agent may run (d-0080, d-0153); the engine walks that
 *   list in the owner's order, one entry per failed attempt, never an entry already tried, never a harness
 *   that is parked or not installed, and for a critic never the Worker's own model family once two are
 *   connected (d-0073). Same-harness model entries count, so "opus, then sonnet" works on one install. The
 *   walk is plain code over the list, so it always ends (each step marks one more slot tried).
 *
 * Exports: fallbackChain(), nextFallback().
 * Depends on: schemas/agent, types/agent-fallback. No IO.
 */

import type { HarnessRef, RunsOn } from '#/schemas/agent.js';
import type { ChainEntry, NextFallbackInput } from '#/types/agent-fallback.types.js';

/** `[primary, ...fallbacks]` with every harness reference resolved (`project_default` to the project's own). */
export function fallbackChain(
  runsOn: RunsOn,
  resolveHarness: (ref: HarnessRef) => string,
): ChainEntry[] {
  return [
    { harness: runsOn.harness, model: runsOn.model },
    ...runsOn.fallbacks.map((f) => ({ harness: f.harness, model: f.model })),
  ].map((e, slot) => ({ slot, harness: resolveHarness(e.harness), model: e.model }));
}

/**
 * The slot to use next: the first entry in the owner's order that was not tried, whose harness is installed
 * and not parked at `now`, and that the family guard allows. Null when nothing is left.
 */
export function nextFallback(input: NextFallbackInput): number | null {
  const parked = (harness: string): boolean =>
    (input.paused[harness]?.until ?? 0) > input.now;

  const usable = (e: ChainEntry): boolean =>
    !input.tried.includes(e.slot) &&
    input.installed(e.harness) &&
    !parked(e.harness) &&
    (input.familyGuard?.(e) ?? true);

  return input.chain.find(usable)?.slot ?? null;
}

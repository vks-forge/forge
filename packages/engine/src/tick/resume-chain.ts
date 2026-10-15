/**
 * Reads the receipt chain to tell whether a resume got as far as its `resumed` link.
 *
 * Why: gate G1 verifies a resumed run segment by segment, and each `resumed` link must be
 *   exactly one generation above the last. When a resume's harness fails to start, the engine
 *   has already stored the new generation on the run row; whether that generation may stay
 *   depends on whether the app wrote its link into the chain before the failure. The chain is
 *   the truth, so the engine asks it.
 *
 * Exports: generationLinked().
 * Depends on: types/engine-state. IO only through the receipt log port.
 */

import type { EngineCtx } from '#/types/engine-state.types.js';

/** True when the run's receipt chain has the `resumed` link for `generation`; unreadable counts as linked (keep, never rewind blindly). */
export async function generationLinked(
  ctx: EngineCtx,
  runId: string,
  generation: number,
): Promise<boolean> {
  try {
    const chain = await ctx.deps.receipts.list(runId);

    return chain.some((r) => r.kind === 'resumed' && r.generation === generation);
  } catch {
    return true;
  }
}

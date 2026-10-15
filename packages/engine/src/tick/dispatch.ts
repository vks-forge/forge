/**
 * Dispatch: decides which tickets get a Worker run this tick, within the limits.
 *
 * Why: starting a run commits budget and risk, so the Director starts only what is ready
 *   and affordable. Ready means: a `planned` ticket whose blockers are done, or a ticket
 *   with a due wake (a retry after a failure, a resume after a human's answer). Which of the
 *   ready tickets start, and in what order, is `pickNext`'s decision (d-0097): committed
 *   work first, projects taking turns, priority within a project, and the global,
 *   per-project, per-harness and In Progress limits all respected, with a harness that is out
 *   of quota skipped. A ticket that does not fit waits for the next tick, it is never dropped.
 *   A wake the engine should not act on is consumed and dropped, never left to fire later: a
 *   ticket whose run reported done is never re-woken, and a wake for a ticket that is
 *   terminal, elsewhere or already running is stale (director-core.md §3).
 *
 * Exports: dispatchReady().
 * Depends on: steps/run-step, tick/dispatch-run, tick/schedule.
 */

import { isHeld } from '#/steps/run-step.js';
import { startRun } from '#/tick/dispatch-run.js';
import { pickFrom, planDispatch } from '#/tick/schedule.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Starts runs for the tickets the scheduler picks, until slots or limits run out. */
export async function dispatchReady(ctx: EngineCtx): Promise<void> {
  const plan = await ctx.deps.storage.transaction((tx) => planDispatch(ctx, tx, true));

  // A held ticket (a failing prompt step, a missing harness) must not use up a slot or a
  // project's turn, so it is taken out before the choice is made.
  const open = {
    ...plan,
    pickable: plan.pickable.filter(
      (p) => !isHeld(ctx, `dispatch:${p.id}`) && !isHeld(ctx, `dispatch_prompt:${p.id}`),
    ),
  };

  const { picked, cursor } = pickFrom(open, ctx.now, ctx.state.schedulerCursor);
  ctx.state.schedulerCursor = cursor;

  for (const p of picked) {
    const candidate = plan.candidates.get(p.id);
    if (candidate) {
      await startRun(ctx, candidate, p.harness);
    }
  }
}

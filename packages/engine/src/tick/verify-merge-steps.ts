/**
 * Merge steps: the tier a diff implies, recording a pass, and the cleanup after Done.
 *
 * Why: the merge door (tick/verify-merge) is the only caller of the git host, and it must stay
 *   readable as one sequence of checks. The three small steps around it live here: the tier comes
 *   from the real diff against the project's tier-C globs (never from the triage guess), a pass is
 *   recorded once per cycle through `transition()` (carrying `hold` when the pipeline has a human
 *   stage, so a tier A ticket waits in Review too), and cleanup after Done is best effort and
 *   never undoes the merge.
 *
 * Exports: tierOfDiff(), recordPass(), cleanup().
 * Depends on: @forge/core (Ticket, Tier), domain/tier-actual, tick/ticket-moves, tick/tick-config. IO only through worktree and host ports.
 */

import type { Ticket, Tier } from '@forge/core';
import { computeTierActual } from '#/domain/tier-actual.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

/** The tier the current diff implies. */
export async function tierOfDiff(ctx: EngineCtx, t: VerifyTarget): Promise<Tier> {
  const diff = await t.runtime.worktrees.diff(t.worktree, t.baseSha);
  const paths = diff.files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));

  return computeTierActual(
    t.ticket.tier_predicted,
    projectSettings(ctx.config, t.project.slug).tier_c_globs,
    paths,
  );
}

/** Records `gate_passed` with `tier` (once per cycle); `hold` sends a tier A pass to the owner's review. */
export async function recordPass(
  ctx: EngineCtx,
  t: VerifyTarget,
  tier: Tier,
  hold: boolean,
): Promise<Ticket> {
  const moved = await moveTicket(ctx.deps.storage, t.ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'verifying' && cur.tier_actual === undefined
      ? {
          events: [
            {
              type: 'gate_passed',
              tier_actual: tier,
              ...(hold ? { hold: true as const } : {}),
            },
          ],
        }
      : null,
  );

  if (!moved.ok) {
    throw new Error(`could not record gate_passed on ${t.ticket.id}: ${moved.reason}`);
  }

  return moved.ticket;
}

/** Best-effort removal of the worktree and the merged branch. */
export async function cleanup(ctx: EngineCtx, t: VerifyTarget): Promise<void> {
  const { deps } = ctx;
  await t.runtime.worktrees.remove(t.worktree).catch((e: unknown) => {
    deps.log?.('warn', `could not remove worktree of ${t.ticket.id}`, {
      error: String(e),
    });
  });

  await t.runtime.gitHost.deleteBranch(t.branch).catch((e: unknown) => {
    deps.log?.('warn', `could not delete branch ${t.branch}`, { error: String(e) });
  });
}

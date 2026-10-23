/**
 * Base sync: the project's base branch as the git host has it right now, once per tick.
 *
 * Why: for a `local` bare or GitHub project nothing ever updated the local base ref, so worktrees
 *   were cut from a stale base and the diff, tier and G1 coverage of a ticket whose branch had the
 *   base merged in would read the wrong frame. The host's `syncBase()` brings the base into the local
 *   repository and says which ref and commit it is. Every phase that cuts or reads a worktree asks
 *   here, so they all agree on one base within a tick, and the fetch (a network call on GitHub) runs
 *   once per project per tick, not once per ticket. Starting a Worker never waits on a failed fetch:
 *   a stale start only means more conflicts later, so `startRefFor` falls back to the project's own
 *   base ref and logs it; the merge door, which cannot be allowed to guess, uses `baseTipFor` and
 *   lets the error stand.
 *
 * Exports: baseTipFor(), startRefFor(), createWorktree().
 * Depends on: @forge/core (BaseTip, GitHost), tick/project-runtime, types/{engine-state,verify}.
 *   IO only through the GitHost port.
 */

import type { BaseTip, GitHost, TicketId, Worktree } from '@forge/core';
import { baseRefFor } from '#/tick/project-runtime.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { ProjectRuntime } from '#/types/verify.types.js';

// One fetch per project per tick; the context object lives for one tick, so the memo never outlives it.
const tips = new WeakMap<EngineCtx, Map<string, Promise<BaseTip>>>();

/** The host's base tip for project `slug` (fetched at most once this tick); rejects when the host cannot be reached. */
export function baseTipFor(
  ctx: EngineCtx,
  slug: string,
  host: GitHost,
): Promise<BaseTip> {
  let byProject = tips.get(ctx);
  if (!byProject) {
    byProject = new Map();
    tips.set(ctx, byProject);
  }

  let tip = byProject.get(slug);
  if (!tip) {
    tip = host.syncBase();
    byProject.set(slug, tip);
  }

  return tip;
}

/** The ref a worktree of `slug` is cut from: the host's fetched base, or the project's own base ref when it has no host or the fetch failed. */
export async function startRefFor(
  ctx: EngineCtx,
  runtime: ProjectRuntime,
  slug: string,
): Promise<string> {
  if (runtime.gitHost === null) {
    return baseRefFor(ctx, slug);
  }

  try {
    return (await baseTipFor(ctx, slug, runtime.gitHost)).ref;
  } catch (e) {
    ctx.deps.log?.(
      'warn',
      `could not sync the base of ${slug}; starting from the local ref`,
      {
        error: String(e),
      },
    );

    return baseRefFor(ctx, slug);
  }
}

/** The ticket's worktree, created (or found) on its branch from the host's fetched base. */
export async function createWorktree(
  ctx: EngineCtx,
  runtime: ProjectRuntime,
  slug: string,
  ticketId: TicketId,
  branch: string,
): Promise<Worktree> {
  return runtime.worktrees.create(
    ticketId,
    branch,
    await startRefFor(ctx, runtime, slug),
  );
}

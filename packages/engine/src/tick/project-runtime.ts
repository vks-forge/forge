/**
 * Resolve a project's runtime and the one base branch every step of its tickets uses.
 *
 * Why: a ticket's work is cut from a base, diffed against that base for the tier, and
 *   merged into a base. If those were read from two places (the engine's default ref and
 *   the project's git host config) a project whose host merges into `develop` would be
 *   diffed and branched from `main`: tiers computed on the wrong diff, PRs full of
 *   unrelated commits. The project's own `git_host.base_branch` is the single answer; the
 *   engine default only serves projects without a host. A runtime built for another
 *   project would push and merge into the wrong repository, so it is refused here.
 *
 * Exports: runtimeFor(), baseRefFor().
 * Depends on: @forge/core (InvalidInputError), tick/tick-config, types/engine-state,
 *   types/verify. No IO of its own.
 */

import { InvalidInputError } from '@forge/core';
import { projectSettings } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { ProjectRuntime } from '#/types/verify.types.js';

/**
 * The runtime the app built for `slug`, or null when it has none; throws when it belongs to
 * another project. Its `config` carries the project's identity from the runtime and its
 * settings (profile, commands, git host, ...) from this tick's snapshot, so a settings
 * edit reaches the next gate run and the next Worker contract.
 */
export function runtimeFor(ctx: EngineCtx, slug: string): ProjectRuntime | null {
  const runtime = ctx.deps.project(slug);
  if (!runtime) {
    return null;
  }

  if (runtime.config.slug !== slug) {
    throw new InvalidInputError(
      `the runtime supplied for project ${slug} is configured for project ${runtime.config.slug}`,
    );
  }

  return {
    ...runtime,
    config: { ...runtime.config, ...projectSettings(ctx.config, slug) },
  };
}

/** The branch worktrees are cut from, tiers are diffed against and PRs target for `slug`. */
export function baseRefFor(ctx: EngineCtx, slug: string): string {
  return runtimeFor(ctx, slug)?.config.git_host?.base_branch ?? ctx.deps.baseRef;
}

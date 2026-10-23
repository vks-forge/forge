/**
 * Reads a run's harness "Bypass permissions" switch.
 *
 * Why: the owner turns Bypass permissions on or off per harness (d-0183). Both the request the
 *   harness is started with (its own no-prompt mode) and the run's tool grant (every `ask` becomes
 *   allow, except the hard floor) must follow that one switch, read when the run starts, so an edit in
 *   Settings applies to the next run and a harness with no stored row follows the one default in core.
 *
 * Exports: runPermissions().
 * Depends on: @forge/core (bypassOn, RunRequest), types/engine-state. IO: one harness row read.
 */

import { bypassOn } from '@forge/core';
import type { RunRequest } from '@forge/core';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** `bypass` unless the harness row turns it off; a harness never registered runs on the default (on). */
export async function runPermissions(
  ctx: EngineCtx,
  harnessId: string,
): Promise<NonNullable<RunRequest['permissions']>> {
  const row = await ctx.deps.storage.transaction((tx) => tx.harnesses.get(harnessId));

  return bypassOn(row ?? {}) ? 'bypass' : 'ask';
}

/**
 * Shared steps of the three memory tools: place the run, build the read options, cap the answer.
 *
 * Why: every memory tool must do the same three things the same way or one of them leaks. It asks the
 *   server (never the Worker) for the run's project and scope, and refuses with a typed error when memory
 *   is not set up or the run cannot be placed; it passes the scope, the actor `worker`, the run and the
 *   ticket to the index so the access log says who looked; and it cuts its answer to a fixed size so a long
 *   record or a long hit list cannot flood the Worker's context. An unknown id and an out-of-scope id use one
 *   message, so asking by id reveals nothing about records the Worker may not see (d-0067, d-0168).
 *
 * Exports: placeRun(), notFound(), capList().
 * Depends on: @forge/core, types/deps.types, types/memory-access.types. No IO.
 */

import { InvalidInputError } from '@forge/core';
import type { ToolContext } from '#/types/deps.types.js';
import type { PlacedRun } from '#/types/memory-access.types.js';

/** `not_found: ...` as a typed tool error; the one message for unknown and out-of-scope. */
export const notFound = (what: string): InvalidInputError =>
  new InvalidInputError(`not_found: ${what}`);

/** The index, the run's project and the read options carrying the server-built scope. */
export async function placeRun(ctx: ToolContext, tool: string): Promise<PlacedRun> {
  const { memory, memoryScope } = ctx.deps;
  if (!memory || !memoryScope) {
    throw new InvalidInputError(
      `invalid_input: ${tool} is not configured (project memory is off)`,
    );
  }

  const placed = await memoryScope(ctx.run.id);
  if (!placed) {
    throw notFound('this run has no project memory');
  }

  return {
    memory,
    project: placed.project,
    scope: placed.scope,
    opts: {
      actor: 'worker',
      scope: placed.scope,
      run_id: ctx.run.id,
      ticket_id: placed.ticket_id,
    },
  };
}

/**
 * Drops items from the end until `render(items)` fits in `max` characters; returns the items kept and
 * whether any were dropped. An item list that cannot fit even empty returns none.
 */
export function capList<T>(
  items: readonly T[],
  max: number,
  render: (kept: readonly T[]) => string,
): { kept: readonly T[]; dropped: boolean } {
  let kept = items;
  while (kept.length > 0 && render(kept).length > max) {
    kept = kept.slice(0, -1);
  }

  return { kept, dropped: kept.length < items.length };
}

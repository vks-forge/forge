/**
 * Memory access types — what a memory tool holds once the server has placed its run.
 *
 * Why: the three memory tools share one placement step (index, project, read options with the server-built
 *   scope), and naming its result in the types folder keeps the tools free of declarations and makes it
 *   plain that nothing a Worker sends is part of it.
 *
 * Exports: PlacedRun.
 * Depends on: @forge/core (types only). Types only.
 */

import type { MemoryIndex, MemoryReadOptions, MemoryScope } from '@forge/core';

/** What a memory tool needs to call the index for this run. */
export interface PlacedRun {
  readonly memory: MemoryIndex;
  readonly project: string;
  /** The scope the server built; the same object is in `opts`. */
  readonly scope: MemoryScope;
  readonly opts: MemoryReadOptions;
}

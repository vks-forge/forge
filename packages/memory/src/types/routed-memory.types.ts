/**
 * Routed memory types — what the server supplies to choose a backend per project, and what it gets back.
 *
 * Why: while memory moves into the database project by project, the server holds two complete backends
 *   (the database and the old git repository) and one rule that picks between them for each project. These
 *   shapes name the pieces so the router stays a thin switch and the rule lives in the server, next to the
 *   import log it reads.
 *
 * Exports: MemoryBackend, RoutedMemoryDeps, RoutedMemory.
 * Depends on: @forge/core (types only). Types only.
 */

import type { MemoryIndex, MemorySource, ProjectMemory } from '@forge/core';

/** Where a project's memory lives now. */
export type MemoryBackend = 'db' | 'files';

export interface RoutedMemoryDeps {
  readonly db: ProjectMemory;
  readonly dbIndex: MemoryIndex;
  readonly files: ProjectMemory;
  readonly fileSource: MemorySource;
  /** Asked on every call, so a project switches the moment its import is verified. */
  readonly stateOf: (project: string) => Promise<MemoryBackend>;
}

export interface RoutedMemory {
  readonly memory: ProjectMemory;
  readonly index: MemoryIndex;
  /** The old whole-slice port, answered from whichever backend the project is on. */
  readonly source: MemorySource;
}

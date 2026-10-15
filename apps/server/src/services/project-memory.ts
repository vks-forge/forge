/**
 * Composes project memory: the Director's writer and reader, and the engine's read slice.
 *
 * Why: each project's memory is a private repository in the data home. The engine reads
 *   it through the small slice port, the API and the Director through the writer and
 *   reader, and all three must point at the same folder. Projects registered before
 *   memory lived here get their repository at startup; if one cannot be created (git
 *   missing, folder not writable) the server still starts and the first write tries
 *   again, so one broken project cannot keep the others from being served.
 *
 * Exports: composeProjectMemory().
 * Depends on: @forge/core (ProjectMemory, MemorySource), @forge/engine (Logger),
 *   @forge/memory. IO: creates a repository per listed project.
 */

import type { MemorySource, ProjectMemory } from '@forge/core';
import type { Logger } from '@forge/engine';
import { createFileMemorySource, createProjectMemory } from '@forge/memory';

/** `rootDir` is `<dataHome>/memory`; `slugs` are the projects served now. */
export async function composeProjectMemory(
  rootDir: string,
  now: () => number,
  log: Logger,
  slugs: readonly string[],
): Promise<{ memory: ProjectMemory; source: MemorySource }> {
  const onSkip = (path: string, reason: string): void =>
    log('warn', 'memory record skipped', { path, reason });

  const memory = createProjectMemory({ rootDir, now: () => new Date(now()), onSkip });
  await Promise.all(
    slugs.map((slug) =>
      memory.init(slug).catch((error: unknown) =>
        log('error', 'project memory repository could not be created', {
          project: slug,
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    ),
  );

  return { memory, source: createFileMemorySource(rootDir, { onSkip }) };
}

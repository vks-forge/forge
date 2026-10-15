/**
 * @forge/memory public API — a project's memory as markdown in a private git repository.
 *
 * Why: the engine depends on the MemorySource port only, and the server on the
 *   ProjectMemory port (Director-only writer plus reader); this package supplies both so
 *   the composition root can wire them to the data home.
 *
 * Exports: createFileMemorySource, createProjectMemory, MemoryRecordFrontMatter,
 *   MemorySourceDeps, ProjectMemoryDeps.
 * Depends on: adapters/file-memory-source, adapters/git-project-memory, schemas/memory-record,
 *   types/memory-source-deps, types/project-memory.
 */

export { createProjectMemory } from './adapters/git-project-memory/create-project-memory.js';
export { createFileMemorySource } from './adapters/file-memory-source.js';
export { MemoryRecordFrontMatter } from './schemas/memory-record.js';
export type { MemorySourceDeps } from './types/memory-source-deps.types.js';
export type { ProjectMemoryDeps } from './types/project-memory.types.js';

/**
 * @forge/memory public API — file-backed project memory for the Director.
 *
 * Why: the engine depends on the MemorySource port only; this package supplies the
 *   markdown-backed implementation so the composition root can wire it in.
 *
 * Exports: createFileMemorySource, MemoryRecordFrontMatter, MemorySourceDeps.
 * Depends on: adapters/file-memory-source, schemas/memory-record, types/memory-source-deps.
 */

export { createFileMemorySource } from './adapters/file-memory-source.js';
export { MemoryRecordFrontMatter } from './schemas/memory-record.js';
export type { MemorySourceDeps } from './types/memory-source-deps.types.js';

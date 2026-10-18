/**
 * @forge/memory public API — a project's memory in the database, its search, its one-time import and its export.
 *
 * Why: the engine depends on the MemorySource and MemoryIndex ports, the server on the ProjectMemory port
 *   (Director-only writer plus reader); this package supplies them so the composition roots can wire them to
 *   the data home. Memory lives in the database (one door for every write, a full-text index, an access
 *   log); the old per-project git repository is read once by the importer, proved against the database and
 *   removed, and until a project is proved it keeps working from its files through the same ports. This
 *   repository's own markdown memory is indexed with the same code for the CLI (d-0168).
 *
 * Exports: createSqlProjectMemory, createSqlMemoryIndex, pruneAccessLog, createMemoryImporter, importStatusOf,
 *   hasRepo, repoDirOf, createMarkdownExporter, scanMarkdown, loadMarkdownInto, readMarkdownFiles,
 *   createRoutedMemory, createProjectMemory, createFileMemorySource, MemoryRecordFrontMatter, and the types of
 *   their options.
 * Depends on: adapters/*, schemas/memory-record, types/*.
 */

export { createProjectMemory } from './adapters/git-project-memory/create-project-memory.js';
export { createFileMemorySource } from './adapters/file-memory-source.js';
export { createMarkdownExporter } from './adapters/markdown-export/export-project.js';
export {
  loadMarkdownInto,
  readMarkdownFiles,
  scanMarkdown,
} from './adapters/markdown-index/scan-markdown.js';
export {
  createMemoryImporter,
  importStatusOf,
} from './adapters/memory-importer/create-importer.js';
export { hasRepo, repoDirOf } from './adapters/memory-importer/read-source.js';
export { createRoutedMemory } from './adapters/routed-memory/create-routed-memory.js';
export { pruneAccessLog } from './adapters/sql-memory-index/access-log.js';
export { createSqlMemoryIndex } from './adapters/sql-memory-index/create-sql-memory-index.js';
export { createSqlProjectMemory } from './adapters/sql-project-memory/create-sql-project-memory.js';
export { MemoryRecordFrontMatter } from './schemas/memory-record.js';
export type {
  ExportDeps,
  ExportFile,
  ImportDeps,
  MarkdownExporter,
} from './types/memory-import.types.js';
export type {
  ManifestEntry,
  MarkdownManifest,
  MarkdownScan,
} from './types/markdown-index.types.js';
export type { MemorySourceDeps } from './types/memory-source-deps.types.js';
export type { ProjectMemoryDeps } from './types/project-memory.types.js';
export type {
  MemoryBackend,
  RoutedMemory,
  RoutedMemoryDeps,
} from './types/routed-memory.types.js';
export type {
  AccessLogSettings,
  SqlIndexDeps,
  SqlMemoryDeps,
} from './types/sql-memory.types.js';

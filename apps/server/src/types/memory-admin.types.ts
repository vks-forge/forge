/**
 * Memory admin types — what the memory API and the start-up migration share.
 *
 * Why: moving each project's memory from its old git repository into the database is a server job with a
 *   status the owner can see and a retry the owner can press, and exporting memory as markdown is a second
 *   admin action. The routes depend on one small port for both, so they hold no logic about repositories or
 *   backups and a route test can supply a fake.
 *
 * Exports: MemoryMigration, MemoryAdmin, MemoryParts, ComposeMemoryInput, MemoryMigrationDeps, MemoryAdminDeps.
 * Depends on: @forge/core, @forge/engine (Logger), @forge/memory, @forge/tools (types). Types only.
 */

import type {
  MemoryAccessLogRow,
  MemoryExportReply,
  MemoryImportStatus,
  MemoryImporter,
  MemoryIndex,
  MemorySource,
  ProjectMemory,
  StorageAdapter,
} from '@forge/core';
import type { Logger } from '@forge/engine';
import type { MemoryBackend } from '@forge/memory';
import type { CatalogueStore } from '@forge/tools';

/** The one-time move of old repositories into the database, project by project. */
export interface MemoryMigration {
  /** Runs for every listed project that still has an old repository; never throws, a failure is logged and recorded. */
  migrateAll(slugs: readonly string[]): Promise<void>;
  /** Backup (once per start), import, verify, delete for one project; throws `MemoryImportRunningError` when one is already running. */
  migrate(slug: string): Promise<MemoryImportStatus>;
}

/** What the memory routes need beyond reading and writing records. */
export interface MemoryAdmin {
  backend(slug: string): Promise<MemoryBackend>;
  importStatus(slug: string): Promise<MemoryImportStatus>;
  runImport(slug: string): Promise<MemoryImportStatus>;
  /** Writes the project's memory as markdown under `<dataHome>/exports/`. */
  exportTo(slug: string): Promise<MemoryExportReply>;
  accessLog(slug: string, limit: number): Promise<MemoryAccessLogRow[]>;
}

/** Everything the assembly gets from composing project memory. */
export interface MemoryParts {
  readonly memory: ProjectMemory;
  readonly index: MemoryIndex;
  /** The old whole-slice port, answered from the right backend per project. */
  readonly source: MemorySource;
  readonly admin: MemoryAdmin;
  readonly migration: MemoryMigration;
  /** What the engine is given (`memory`, `memoryIndex`), to spread into its dependencies. */
  readonly forEngine: {
    readonly memory: MemorySource;
    readonly memoryIndex: MemoryIndex;
  };
  /** What the routes are given (`memory`, `memoryIndex`, `memoryAdmin`), to spread into their dependencies. */
  readonly forRoutes: {
    readonly memory: ProjectMemory;
    readonly memoryIndex: MemoryIndex;
    readonly memoryAdmin: MemoryAdmin;
  };
}

/** What `composeProjectMemory` is given. */
export interface ComposeMemoryInput {
  /** The tracked storage: memory writes announce to open screens. */
  readonly storage: StorageAdapter;
  readonly dataHome: {
    readonly home: string;
    readonly memoryDir: string;
    readonly backupsDir: string;
    readonly dbPath: string;
  };
  readonly now: () => number;
  readonly log: Logger;
  /** The projects served now: those that still hold an old repository are moved in before this returns. */
  readonly slugs: readonly string[];
  /** The tool catalogue to teach the built-in tools it has never held; absent in tests. */
  readonly catalogue?: CatalogueStore | undefined;
}

export interface MemoryMigrationDeps {
  readonly storage: StorageAdapter;
  readonly importer: MemoryImporter;
  /** `<dataHome>/memory`. */
  readonly rootDir: string;
  /** Takes and verifies the backup; returns its folder. */
  readonly backup: (slugs: readonly string[]) => Promise<string>;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface MemoryAdminDeps {
  readonly storage: StorageAdapter;
  readonly stateOf: (slug: string) => Promise<MemoryBackend>;
  readonly migration: MemoryMigration;
  readonly memoryDir: string;
  /** `<dataHome>/exports`. */
  readonly exportsDir: string;
  readonly now: () => Date;
}

/**
 * Project memory types — options, stored records and the helper shapes of the git-backed store.
 *
 * Why: the memory store reads whole folders of record files, rewrites some of them and
 *   builds an index from what it found. These shapes name what the pieces hand each
 *   other (a record plus where it lives, a planned change, a parsed file) so the pure
 *   rules in `domain/` and the IO in `adapters/` agree without sharing code.
 *
 * Exports: ProjectMemoryDeps, MemoryFolder, StoredRecord, RecordFileResult, IndexEntry,
 *   IndexInput, PlannedChange, MemoryPlanner, SerialQueue.
 * Depends on: @forge/core (MemoryRecord type). Types only.
 */

import type { MemoryRecord } from '@forge/core';

/** Options of `createProjectMemory`. */
export interface ProjectMemoryDeps {
  /** `<dataHome>/memory`; one private git repository per project lives in `<rootDir>/<slug>/`. */
  readonly rootDir: string;
  /** Clock; injected so commits and `valid_from` are deterministic in tests. */
  readonly now: () => Date;
  /** Called once per record file that could not be read or did not validate. */
  readonly onSkip?: (path: string, reason: string) => void;
}

/** The folders a record can live in. */
export type MemoryFolder = 'decisions' | 'rejected' | 'proposed' | 'outcomes';

/** A valid record file found in a project's repository. */
export interface StoredRecord {
  readonly folder: MemoryFolder;
  /** Path relative to the repository root, with forward slashes. */
  readonly relPath: string;
  readonly record: MemoryRecord;
  readonly body: string;
}

/** Outcome of parsing one record file; failures carry a reason, never throw. */
export type RecordFileResult =
  | { readonly ok: true; readonly record: MemoryRecord; readonly body: string }
  | { readonly ok: false; readonly reason: string };

/** One pointer line of the generated `MEMORY.md`. */
export interface IndexEntry {
  readonly id: string;
  readonly statement: string;
  /** Path relative to the repository root, with forward slashes. */
  readonly relPath: string;
}

/** What the index builder renders. */
export interface IndexInput {
  readonly slug: string;
  readonly decisions: readonly IndexEntry[];
  readonly rejected: readonly IndexEntry[];
  readonly proposed: readonly IndexEntry[];
  /** Number of superseded decisions kept in `decisions/`. */
  readonly superseded: number;
  /** Oldest first. */
  readonly outcomes: readonly IndexEntry[];
  /** Line budget; outcome pointers beyond it are archived (default 200). */
  readonly maxLines?: number;
}

/** Files a write wants on disk: contents to put and paths to delete, relative to the repository. */
export interface PlannedChange {
  readonly id: string;
  /** Commit subject, for example `memory: approve x-0001`. */
  readonly subject: string;
  readonly write: ReadonlyMap<string, string>;
  readonly remove: readonly string[];
}

/** Plans one write from the records now on disk and the current time (ISO). Throws to refuse it. */
export type MemoryPlanner = (
  records: readonly StoredRecord[],
  at: string,
) => PlannedChange;

/** Runs tasks one at a time per key. */
export interface SerialQueue {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}

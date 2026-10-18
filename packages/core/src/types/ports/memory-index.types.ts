/**
 * MemoryIndex and MemoryImporter ports — reading project memory by relevance, and moving an old repository in.
 *
 * Why: the Director and the Workers must not read the whole memory on every call. They ask a question
 *   and get the few records that answer it, plus every rejected approach, with the project, the
 *   scope and the actor named so what each of them looked up is logged. A Worker's scope is built by
 *   the server from its agent and can only narrow. The importer is the one-time bridge from the
 *   git repositories earlier versions kept: it reads the last commit, never loses a record, proves the
 *   copy before anything is deleted and removes the old repository only on that proof (d-0168).
 *
 * Exports: MemoryReadOptions, MemoryDigest, MemoryIndex, MemoryImporter.
 * Depends on: schemas/memory-db, schemas/memory-db-tools, schemas/memory-record, types/ports/memory-source. Types only.
 */

import type {
  MemoryAidVersion,
  MemoryEvent,
  MemoryImportStatus,
  MemoryRecordView,
} from '#/schemas/memory-db.js';
import type {
  MemoryActor,
  MemoryRelated,
  MemoryScope,
  MemorySearchQuery,
  MemorySearchReply,
} from '#/schemas/memory-db-tools.js';
import type { MemoryListEntry } from '#/schemas/memory-record.js';
import type { MemoryRecordRef } from '#/types/ports/memory-source.types.js';

/** Who is reading and for what; written to the access log with every read. */
export interface MemoryReadOptions {
  readonly actor: MemoryActor;
  /** Only narrows; absent means the actor's own full view (the Director, the CLI and the web). */
  readonly scope?: MemoryScope;
  readonly run_id?: string;
  readonly ticket_id?: string;
}

/** What the Director needs to say how much it left out, and what words the project uses. */
export interface MemoryDigest {
  readonly decisions: number;
  readonly rejected: number;
  readonly proposals: number;
  readonly pinned: number;
  /** Tags of active records with how many hold each, most used first. */
  readonly tags: readonly { readonly tag: string; readonly count: number }[];
}

export interface MemoryIndex {
  search(query: MemorySearchQuery): Promise<MemorySearchReply>;
  /** Records by id inside the scope; ids that are unknown or out of scope come back in `missing`, never told apart. */
  get(
    project: string,
    ids: readonly string[],
    opts: MemoryReadOptions & { readonly full?: boolean },
  ): Promise<{ records: MemoryRecordView[]; missing: string[] }>;
  /** Up to `k` (at most 5) neighbours; null when the record is unknown or out of scope. */
  related(
    project: string,
    id: string,
    k: number,
    opts: MemoryReadOptions,
  ): Promise<MemoryRelated[] | null>;
  /** The list the memory screen shows; `scope` narrows it. */
  list(project: string, scope?: MemoryScope): Promise<MemoryListEntry[]>;
  digest(project: string, scope?: MemoryScope): Promise<MemoryDigest>;
  /** Every active rejected approach (newest first, at most `limit`), never ranked away. */
  rejected(
    project: string,
    limit?: number,
    scope?: MemoryScope,
  ): Promise<MemoryRecordRef[]>;
  /** Pinned active decisions, newest first, at most `limit`. */
  pinned(project: string, limit: number, scope?: MemoryScope): Promise<MemoryRecordRef[]>;
  /** Every active decision inside the scope (the old whole slice), newest first. */
  decisions(project: string, scope?: MemoryScope): Promise<MemoryRecordRef[]>;
  history(
    project: string,
    id: string,
  ): Promise<{ events: MemoryEvent[]; versions: MemoryAidVersion[] } | null>;
}

export interface MemoryImporter {
  /** Reads the project's old repository at its last commit and stores every record; records the attempt and verifies it. */
  import(project: string, backupPath: string | null): Promise<MemoryImportStatus>;
  /** Compares the old repository with the database again and updates the attempt. */
  verify(project: string): Promise<MemoryImportStatus>;
  /**
   * Removes the old repository folder, only when the latest attempt is verified, HEAD still equals the
   * recorded commit, and the path is the project's own repository inside the memory folder.
   * Returns false (deleting nothing) otherwise.
   */
  deleteRepo(project: string): Promise<boolean>;
}

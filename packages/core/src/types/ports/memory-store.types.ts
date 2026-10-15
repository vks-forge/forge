/**
 * Project memory ports — the Director's writer and the read side behind the memory API.
 *
 * Why: a project's memory is written by exactly one party, the Director, on the owner's
 *   word, and no Worker may reach it. Keeping the writer a port means the engine and the
 *   API depend on a small contract (propose, decide, approve, reject, supersede, append an
 *   outcome), each call being one durable, attributable change, while the git repository,
 *   the index file and the one-writer-at-a-time rule stay inside the adapter (d-0007,
 *   d-0086).
 *
 * Exports: MemoryWriteResult, MemoryReader, MemoryWriter, ProjectMemory.
 * Depends on: schemas/memory-record (types only).
 */

import type {
  DecisionInput,
  MemoryListEntry,
  MemoryRecordWithBody,
  ProposalInput,
} from '#/schemas/memory-record.js';

/** What a write returns: the record it touched and the commit that holds the change. */
export interface MemoryWriteResult {
  readonly id: string;
  /** Commit sha in the project's memory repository. */
  readonly commit: string;
}

/** Read side: pending proposals, decisions and rejected approaches of one project. */
export interface MemoryReader {
  /** Pending proposals first, then decisions, then rejected; ids ascending. Unknown project: empty. */
  list(projectSlug: string): Promise<readonly MemoryListEntry[]>;
  /** One record with its body, or null when the project or the id is unknown. */
  get(projectSlug: string, id: string): Promise<MemoryRecordWithBody | null>;
}

/**
 * Director-only writer. Each call changes files, rebuilds the index and makes one commit.
 * Calls for one project run one at a time. Records are never edited in place: a change is
 * a state move (approve, reject) or a new record that supersedes the old one.
 */
export interface MemoryWriter {
  /** Writes `proposed/x-NNNN` with status `pending`, author `director`. */
  propose(projectSlug: string, input: ProposalInput): Promise<MemoryWriteResult>;
  /** Writes `decisions/d-NNNN` with status `active`, author `user`. */
  decide(projectSlug: string, input: DecisionInput): Promise<MemoryWriteResult>;
  /** Moves a pending proposal to `decisions/`, keeping its id, stamping `approved_at` and `approved_by`. */
  approve(projectSlug: string, id: string, by: string): Promise<MemoryWriteResult>;
  /** Moves a pending proposal to `rejected/` with the reason; the id is kept. */
  reject(
    projectSlug: string,
    id: string,
    reason: string,
    by: string,
  ): Promise<MemoryWriteResult>;
  /** Writes a new decision that `supersedes` the old one and marks the old one superseded. */
  supersede(
    projectSlug: string,
    oldId: string,
    input: DecisionInput,
  ): Promise<MemoryWriteResult>;
  /** Appends `outcomes/YYYY-MM/o-NNNN` (what was done, decided, is pending). */
  appendOutcome(projectSlug: string, text: string): Promise<MemoryWriteResult>;
}

/** The whole memory service of one install. */
export interface ProjectMemory {
  /** Creates the project's private repository if missing; safe to call again. */
  init(projectSlug: string): Promise<void>;
  readonly reader: MemoryReader;
  readonly writer: MemoryWriter;
}

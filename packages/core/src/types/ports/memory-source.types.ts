/**
 * MemorySource port — the read side of project memory for Director steps.
 *
 * Why: triage and dispatch_prompt must see the project's active decisions and its rejected
 *   approaches so the Director never proposes something the owner already ruled out, and
 *   Workers get the same constraints in their prompt (memory-system.md, d-0007). The engine
 *   needs only a small, read-only slice (id and statement), so it depends on this port and
 *   not on the markdown files, the index or the writer.
 *
 * Exports: MemoryRecordRef, MemoryFilter, MemorySlice, MemorySource.
 * Depends on: nothing. Types only.
 */

/** One active record: its id (`d-0012`), the statement the owner approved and its tags. */
export interface MemoryRecordRef {
  readonly id: string;
  readonly statement: string;
  /** Absent reads as no tags. */
  readonly tags?: readonly string[];
}

/** What part of a slice an agent sees: records carrying one of `tags` (empty means all) and whether rejected approaches are included. */
export interface MemoryFilter {
  readonly tags: readonly string[];
  readonly include_rejected: boolean;
}

/** Active decisions and rejected approaches of one project. */
export interface MemorySlice {
  readonly decisions: readonly MemoryRecordRef[];
  readonly rejected: readonly MemoryRecordRef[];
}

/** Read-only memory slice per project. An unknown project yields an empty slice, never an error. */
export interface MemorySource {
  /** The slice, narrowed by `filter` when given; without one, the whole slice. */
  slice(projectSlug: string, filter?: MemoryFilter): Promise<MemorySlice>;
}

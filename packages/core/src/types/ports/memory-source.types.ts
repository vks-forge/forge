/**
 * MemorySource port — the read side of project memory for Director steps.
 *
 * Why: triage and dispatch_prompt must see the project's active decisions and its rejected
 *   approaches so the Director never proposes something the owner already ruled out, and
 *   Workers get the same constraints in their prompt (memory-system.md, d-0007). The engine
 *   needs only a small, read-only slice (id and statement), so it depends on this port and
 *   not on the markdown files, the index or the writer.
 *
 * Exports: MemoryRecordRef, MemorySlice, MemorySource.
 * Depends on: nothing. Types only.
 */

/** One active record: its id (`d-0012`) and the statement the owner approved. */
export interface MemoryRecordRef {
  readonly id: string;
  readonly statement: string;
}

/** Active decisions and rejected approaches of one project. */
export interface MemorySlice {
  readonly decisions: readonly MemoryRecordRef[];
  readonly rejected: readonly MemoryRecordRef[];
}

/** Read-only memory slice per project. An unknown project yields an empty slice, never an error. */
export interface MemorySource {
  slice(projectSlug: string): Promise<MemorySlice>;
}

/**
 * Project events port — "something changed in this project, refetch these queries".
 *
 * Why: the control room keeps TanStack queries for the Board, the Card page, the ticket
 *   list and the Inbox, and polls them as a fallback. To update within a second it needs the
 *   server to say which queries are stale the moment a write commits (d-0132, d-0141 item 5).
 *   The engine writes cards and tickets too, and some of what a card page shows (the
 *   Director "thinking" flag) is engine memory, not a stored row, so the engine gets this
 *   one-method port instead of knowing about HTTP or SSE. The message carries query keys
 *   only: the client refetches, nothing is replayed.
 *
 * Exports: QueryKey, ProjectEventSink.
 * Depends on: none. Types only.
 */

/** A TanStack query key as the web client builds it, e.g. `["card", "DCP-C1"]`. */
export type QueryKey = readonly string[];

export interface ProjectEventSink {
  /** Tells watchers of `project` (its slug) that these queries are stale. Never throws; fire and forget. */
  invalidate(project: string, keys: readonly QueryKey[]): void;
}

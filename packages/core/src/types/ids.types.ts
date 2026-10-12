/**
 * Parsed ticket id shape.
 *
 * Why: `parseTicketId()` returns its parts as a named type so callers (branch parsing, storage) share one shape (d-0021).
 *
 * Exports: ParsedTicketId.
 * Depends on: No IO (types only).
 */

/** Project prefix and sequence number of a ticket id. */
export interface ParsedTicketId {
  readonly project: string;
  readonly n: number;
}

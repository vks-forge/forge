/**
 * Parsed ticket id shape.
 *
 * Why: storage, branch parsing and the UI each need a ticket id's project and sequence
 *   number separately (per-project numbering, display grouping). One named shape means
 *   they read a parsed id the same way instead of re-splitting the string (d-0021).
 *
 * Exports: ParsedTicketId.
 * Depends on: No IO (types only).
 */

/** Project prefix and sequence number of a ticket id. */
export interface ParsedTicketId {
  readonly project: string;
  readonly n: number;
}

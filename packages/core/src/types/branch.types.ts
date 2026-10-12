/**
 * Parsed factory branch shape.
 *
 * Why: `parseBranchName()` returns the type, ticket id and slug of a `<type>/<id>-<slug>` branch (d-0021, control-room-and-platform.md §6).
 *
 * Exports: ParsedBranch.
 * Depends on: schemas/ids, schemas/ticket. No IO (types only).
 */

import type { TicketId } from '#/schemas/ids.js';
import type { TicketType } from '#/schemas/ticket.js';

/** The three parts of a Forge branch name. */
export interface ParsedBranch {
  readonly type: TicketType;
  readonly ticketId: TicketId;
  readonly slug: string;
}

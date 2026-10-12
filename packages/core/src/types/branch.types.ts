/**
 * Parsed factory branch shape.
 *
 * Why: the git host adapter, worktree manager and PR bot all need the same three facts
 *   recovered from a factory branch name (type, ticket id, slug) to map a PR or checkout
 *   back to its ticket; one named shape keeps them in agreement (d-0021,
 *   control-room-and-platform.md §6).
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

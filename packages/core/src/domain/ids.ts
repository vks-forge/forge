/**
 * Ticket id construction and parsing — `<PROJECT>-<n>`.
 *
 * Why: ticket ids are public as `<PROJECT>-<n>` (d-0021) and appear in branch names and
 *   the UI; one constructor and one parser guarantee the same grammar everywhere.
 *   Prefixes stay short because the dev host has LongPathsEnabled=0 (m0-brief.md §5).
 *
 * Exports: makeTicketId(), parseTicketId().
 * Depends on: schemas/ids, shared/errors, shared/result, types/ids, types/result. No IO.
 */

import { InvalidInputError } from '#/shared/errors.js';
import { PROJECT_PREFIX_PATTERN, TICKET_ID_PATTERN, TicketId } from '#/schemas/ids.js';
import type { ParsedTicketId } from '#/types/ids.types.js';
import { err, ok } from '#/shared/result.js';
import type { Result } from '#/types/result.types.js';

/** Builds a {@link TicketId}; throws `InvalidInputError` on a bad prefix or number (caller bug, not runtime fault). */
export function makeTicketId(project: string, n: number): TicketId {
  if (!PROJECT_PREFIX_PATTERN.test(project) || !Number.isSafeInteger(n) || n < 1) {
    throw new InvalidInputError(`invalid ticket id parts: ${project}, ${n}`);
  }
  return TicketId.parse(`${project}-${n}`);
}

/** Parses a raw string into its parts; returns an error result instead of throwing. */
export function parseTicketId(raw: string): Result<ParsedTicketId, string> {
  const m = TICKET_ID_PATTERN.exec(raw);
  const project = m?.[1];
  const num = m?.[2];
  if (project === undefined || num === undefined) return err(`not a ticket id: ${raw}`);
  const n = Number(num);
  if (!Number.isSafeInteger(n)) return err(`ticket number out of range: ${raw}`);
  return ok({ project, n });
}

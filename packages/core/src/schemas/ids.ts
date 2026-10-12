/**
 * Ticket id and project prefix schemas.
 *
 * Why: ticket ids are public as `<PROJECT>-<n>` (d-0021) and appear in branch names and the UI; the zod schema is the single grammar (code.md rule 4). Prefixes stay short because the dev host has LongPathsEnabled=0 (m0-brief.md §5).
 *
 * Exports: PROJECT_PREFIX_PATTERN, TICKET_ID_PATTERN, ProjectPrefix, TicketId.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Uppercase project prefix, 1-10 chars, starting with a letter. */
export const PROJECT_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{0,9}$/;
/** `<PROJECT>-<n>` with `n` positive and without a leading zero. */
export const TICKET_ID_PATTERN = /^([A-Z][A-Z0-9]{0,9})-([1-9][0-9]*)$/;

/** Schema for a project prefix such as `SF`. */
export const ProjectPrefix = z.string().regex(PROJECT_PREFIX_PATTERN);
/** Branded schema for `<PROJECT>-<n>` ticket ids; `n` is positive with no leading zero. */
export const TicketId = z.string().regex(TICKET_ID_PATTERN).brand<'TicketId'>();
export type TicketId = z.infer<typeof TicketId>;

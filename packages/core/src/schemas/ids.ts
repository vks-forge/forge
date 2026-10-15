/**
 * Ticket id and project prefix schemas.
 *
 * Why: ticket ids are the public key of the system: users type them, branches and PRs
 *   embed them, and every table references them. Defining the grammar once means a
 *   malformed id is rejected at the boundary (chat, HTTP, branch parsing, a DB row)
 *   before it can address the wrong ticket. Project prefixes are capped at 10 uppercase
 *   characters because ids become folder and branch names and the dev host runs with
 *   Windows long paths disabled (d-0021).
 *
 * Cards use `<PROJECT>-C<n>`: the `C` makes a card id impossible to read as a ticket id, so a
 *   route or chat message that receives an id knows which record it names.
 *
 * Exports: PROJECT_PREFIX_PATTERN, TICKET_ID_PATTERN, CARD_ID_PATTERN, ProjectPrefix, TicketId,
 *   CardId.
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

/** `<PROJECT>-C<n>` with `n` positive and without a leading zero; never matches a ticket id. */
export const CARD_ID_PATTERN = /^([A-Z][A-Z0-9]{0,9})-C([1-9][0-9]*)$/;
/** Branded schema for `<PROJECT>-C<n>` card ids. */
export const CardId = z.string().regex(CARD_ID_PATTERN).brand<'CardId'>();
export type CardId = z.infer<typeof CardId>;

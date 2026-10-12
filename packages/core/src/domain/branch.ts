/**
 * Ticket branch naming — build and parse `<type>/<id>-<slug>`.
 *
 * Why: a ticket's branch is the only handle the git host, the PR bot and a human reading
 *   `git branch` share with the factory. The dispatcher creates it, and the merge policy
 *   and PR bot recover the ticket id and type from it to decide which tier's rules gate
 *   the merge. If each caller hand-rolled the format, a branch could drift so a PR no
 *   longer maps back to its ticket, or maps to the wrong one. One builder and one strict
 *   parser keep the mapping lossless, and anything that is not a factory branch (`main`,
 *   a human's branch) is rejected instead of guessed at (d-0021,
 *   control-room-and-platform.md §6).
 *
 * Exports: MAX_SLUG_LENGTH, slugify(), branchName(), parseBranchName().
 * Depends on: schemas/ids, schemas/ticket, shared/result, types/branch, types/result. No IO.
 */

import { TicketId } from '#/schemas/ids.js';
import { TicketType } from '#/schemas/ticket.js';
import { err, ok } from '#/shared/result.js';
import type { ParsedBranch } from '#/types/branch.types.js';
import type { Result } from '#/types/result.types.js';

/** Longest slug kept in a branch name. */
export const MAX_SLUG_LENGTH = 40;
const FALLBACK_SLUG = 'untitled';

/** Lowercase ascii slug of a title: accents stripped, separators collapsed, capped at {@link MAX_SLUG_LENGTH}, `untitled` when nothing survives. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug === '' ? FALLBACK_SLUG : slug;
}

/** Builds `<type>/<id>-<slug>` (d-0021, control-room-and-platform.md §6). */
export function branchName(type: TicketType, ticketId: TicketId, title: string): string {
  return `${type}/${ticketId}-${slugify(title)}`;
}

const BRANCH_PATTERN =
  /^([a-z]+)\/([A-Z][A-Z0-9]{0,9}-[1-9][0-9]*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Parses a Forge branch name; returns an error result (never throws) for anything else, e.g. `main`. */
export function parseBranchName(branch: string): Result<ParsedBranch, string> {
  const m = BRANCH_PATTERN.exec(branch);
  const type = TicketType.safeParse(m?.[1]);
  const id = TicketId.safeParse(m?.[2]);
  const slug = m?.[3];
  if (!type.success || !id.success || slug === undefined) {
    return err(`not a Forge branch: ${branch}`);
  }
  return ok({ type: type.data, ticketId: id.data, slug });
}

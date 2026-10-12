/**
 * Ticket branch naming — build and parse `<type>/<id>-<slug>`.
 *
 * Why: git branches are the public handle of a ticket; one pure builder and one parser
 *   keep the format in a single place so the git host adapter, worktree manager and PR
 *   bot never hand-roll it (d-0021, control-room-and-platform.md §6 git write policy,
 *   code.md rule 10).
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

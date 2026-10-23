/**
 * Conflict context: what the ticket's writer is told about a clash with main.
 *
 * Why: "the merge conflicts" is not enough for a Worker (or an owner) to combine two changes. They
 *   need the files, which of them cannot be fixed by editing markers (binary, deleted on one side),
 *   and what the other change set out to do. Main's squash-merge subjects name the Forge ticket
 *   behind each commit (`feat(FR-6): title (#12)`), so this reads that ticket's title and the start of
 *   its plan; a commit that is not Forge's (a person pushed straight to main) is listed by its subject.
 *   It also words the one-line card progress notes ("FR-8 clashes with FR-6 in src/cli.ts; the Worker
 *   is combining both changes.") so the owner sees the work without an escalation.
 *
 * Exports: buildConflictInfo(), clashNote().
 * Depends on: @forge/core (ConflictFile, UpstreamCommit), domain/conflict-wake, schemas/conflict.
 *   IO: reads tickets.
 */

import type { ConflictFile, TicketId, UpstreamCommit } from '@forge/core';
import { upstreamTicketId } from '#/domain/conflict-wake.js';
import type { ConflictInfo, ConflictUpstream } from '#/schemas/conflict.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

const MAX_FILES = 50;
const MAX_UPSTREAM = 20;
const SUMMARY_CHARS = 300;

/** The clash as the writer is told it: files (capped) and the upstream tickets that changed them first, each once. */
export async function buildConflictInfo(
  ctx: EngineCtx,
  t: Pick<VerifyTarget, 'ticket'>,
  files: readonly ConflictFile[],
  upstream: readonly UpstreamCommit[],
): Promise<ConflictInfo> {
  const seen = new Set<string>();
  const named: ConflictUpstream[] = [];
  for (const commit of upstream) {
    const id = upstreamTicketId(commit.subject);
    const other =
      id === undefined || id === t.ticket.id
        ? null
        : await ctx.deps.storage.transaction((tx) => tx.tickets.get(id as TicketId));

    const found = other?.project === t.ticket.project ? other : null;
    const key = found?.id ?? commit.subject;
    if (seen.has(key) || named.length >= MAX_UPSTREAM) {
      continue;
    }

    seen.add(key);
    named.push({
      ref: commit.sha.slice(0, 8),
      ...(found ? { ticket_id: found.id } : {}),
      title: found?.title ?? (commit.subject || commit.sha),
      ...(found && found.body.trim() !== ''
        ? { summary: found.body.trim().slice(0, SUMMARY_CHARS) }
        : {}),
    });
  }

  return {
    files: files.slice(0, MAX_FILES).map((f) => ({
      path: f.path,
      ...(f.binary ? { binary: true } : {}),
      ...(f.deletedBy === undefined ? {} : { deleted_by: f.deletedBy }),
    })),
    upstream: named,
  };
}

/** The card's progress line for a clash being sent to the writer. */
export function clashNote(ticketId: string, info: ConflictInfo): string {
  const ids = [
    ...new Set(info.upstream.flatMap((u) => (u.ticket_id ? [u.ticket_id] : []))),
  ];

  const who = ids.length > 0 ? ids.join(', ') : 'changes merged first';
  const paths = info.files.map((f) => f.path);
  const shown = paths.slice(0, 3).join(', ');
  const more = paths.length > 3 ? ` and ${paths.length - 3} more` : '';

  return `${ticketId} clashes with ${who} in ${shown}${more}; the Worker is combining both changes.`;
}

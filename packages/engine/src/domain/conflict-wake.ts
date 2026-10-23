/**
 * Conflict wake: the words a merge conflict travels in, and the payload shape of its escalation.
 *
 * Why: a clash with main is handed to the ticket's writer as a continuation wake whose reason is
 *   `merge_conflict: <json>`. The reason is durable, so the resolver's prompt carries the files and
 *   the upstream tickets even if the server restarts in between; the owner's Retry rebuilds the same
 *   wake from the escalation payload plus the owner's note. One module writes and reads that reason
 *   (the dispatch step and the wake delta both read it), and one function names the Forge ticket a
 *   squash-merge subject (`type(ID): title (#n)`) belongs to, so a Worker is told "FR-6 changed this
 *   first", not just a commit hash.
 *
 * Exports: CONFLICT_WAKE_PREFIX, conflictWakeReason(), parseConflictWake(), upstreamTicketId(),
 *   conflictPayload(), conflictFromPayload().
 * Depends on: @forge/core (EscalationFailure), schemas/conflict. No IO.
 */

import type { EscalationFailure } from '@forge/core';
import { ConflictInfo } from '#/schemas/conflict.js';

/** Starts the reason of the continuation wake that sends a conflict to the writer. */
export const CONFLICT_WAKE_PREFIX = 'merge_conflict: ';

/** The wake reason for `info`. */
export const conflictWakeReason = (info: ConflictInfo): string =>
  `${CONFLICT_WAKE_PREFIX}${JSON.stringify(info)}`;

/** The conflict a wake reason carries, or null for any other reason (or a damaged one). */
export function parseConflictWake(reason: string | undefined): ConflictInfo | null {
  if (reason === undefined || !reason.startsWith(CONFLICT_WAKE_PREFIX)) {
    return null;
  }

  try {
    const parsed = ConflictInfo.safeParse(
      JSON.parse(reason.slice(CONFLICT_WAKE_PREFIX.length)),
    );

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const SUBJECT_TICKET = /^\w+\(([A-Za-z][A-Za-z0-9]*-\d+)\)[!:]/;

/** The Forge ticket id a squash-merge subject names (`feat(FR-6): title (#12)`), or undefined. */
export const upstreamTicketId = (subject: string): string | undefined =>
  SUBJECT_TICKET.exec(subject)?.[1];

/** The escalation payload's `conflict` field for `info`. */
export function conflictPayload(
  info: ConflictInfo,
): NonNullable<EscalationFailure['conflict']> {
  return {
    files: info.files.map((f) => f.path),
    upstream: info.upstream.map((u) => ({
      ref: u.ref,
      ...(u.ticket_id === undefined ? {} : { ticket_id: u.ticket_id }),
      title: u.title,
    })),
  };
}

/** The wake info rebuilt from an escalation payload (paths only: the file kinds are not kept) and the owner's note. */
export function conflictFromPayload(
  conflict: EscalationFailure['conflict'],
  note?: string,
): ConflictInfo {
  return {
    files: (conflict?.files ?? []).map((path) => ({ path })),
    upstream: [...(conflict?.upstream ?? [])],
    ...(note ? { note } : {}),
  };
}

/**
 * Patch validation shared by both adapters, plus the SQL SET builder.
 *
 * Why: patches are how the Director changes tickets, runs and interactions, and they
 *   come from many callers. Validating them against the core schemas, strictly so
 *   unknown fields are rejected, before touching a row means a typo cannot silently
 *   write nothing or corrupt a column. The CAS version rule lives here once so sqlite
 *   and memory cannot drift: the CAS always moves `status_version` to expected + 1 and a
 *   patch that tries to set it is refused, since a caller-chosen version could rewind or
 *   skip the counter and let a stale writer win (director-core.md §3). A key present with
 *   value `undefined` means "clear this optional column" in both adapters, so a patch
 *   built from `transition()` cannot leave a stale `blocked_reason` or `tier_actual`
 *   behind in one backend and not the other.
 *
 * Also holds the one never-reopen rule for runs: a run with `ended_at` may not be moved back
 *   to `starting` / `running` or have its end time cleared, in either backend (a resume is a
 *   new run row).
 *
 * Exports: parseTicketPatch(), parseRunPatch(), parseInteractionPatch(), assertNotReopened(),
 *   buildSetClause().
 * Depends on: @forge/core, types/storage-driver.types. No IO.
 */

import { Interaction, InvalidInputError, Run, Ticket } from '@forge/core';
import type { TicketPatch } from '@forge/core';
import type { ColumnCodec, SqlValue } from '#/types/storage-driver.types.js';

// `parent` and `blocked_by` are derived from ticket_relations, so a patch cannot carry them.
const TicketPatchSchema = Ticket.omit({
  id: true,
  project: true,
  created_at: true,
  parent: true,
  blocked_by: true,
})
  .partial()
  .strict();

const RunPatchSchema = Run.omit({ id: true }).partial().strict();
const InteractionPatchSchema = Interaction.omit({ id: true }).partial().strict();

/** Validate a ticket patch and set `status_version` to expectedVersion + 1; a patch that carries `status_version` is refused. */
export function parseTicketPatch(
  expectedVersion: number,
  patch: TicketPatch,
): Partial<Ticket> {
  if ('status_version' in patch) {
    throw new InvalidInputError(
      'status_version cannot be set by a patch; updateTicketCas sets it to expectedVersion + 1',
    );
  }

  const parsed = TicketPatchSchema.parse(patch) as Partial<Ticket>;

  return { ...parsed, status_version: expectedVersion + 1 };
}

export function parseRunPatch(patch: Partial<Omit<Run, 'id'>>): Partial<Omit<Run, 'id'>> {
  return RunPatchSchema.parse(patch) as Partial<Omit<Run, 'id'>>;
}

/**
 * Throws InvalidInputError when `patch` would reopen run `id`, which already has an end
 * time (`hasEnded`): clearing `ended_at` or setting an active status. Late evidence
 * (`final_chain_hash`) and the reconcile hand-off (`settling`, `settled`) are fine.
 */
export function assertNotReopened(
  id: string,
  hasEnded: boolean,
  patch: Partial<Omit<Run, 'id'>>,
): void {
  if (!hasEnded) {
    return;
  }

  const clearsEnd = 'ended_at' in patch && patch.ended_at === undefined;
  const reactivates = patch.status === 'starting' || patch.status === 'running';
  if (clearsEnd || reactivates) {
    throw new InvalidInputError(
      `run ${id} has ended and is never reopened; resume it as a new run with retry_of`,
    );
  }
}

export function parseInteractionPatch(
  patch: Partial<Omit<Interaction, 'id'>>,
): Partial<Omit<Interaction, 'id'>> {
  return InteractionPatchSchema.parse(patch) as Partial<Omit<Interaction, 'id'>>;
}

/**
 * Build `col = ?, ...` and its params from a parsed patch; unknown fields are a bug.
 * A present-but-undefined field binds NULL when its column is `clearable`, and is an
 * InvalidInputError for a required column.
 */
export function buildSetClause(
  codecs: Readonly<Record<string, ColumnCodec>>,
  patch: object,
): { sql: string; params: SqlValue[] } {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const [field, value] of Object.entries(patch)) {
    const codec = codecs[field];
    if (!codec) {
      throw new InvalidInputError(`No column mapped for field '${field}'`);
    }

    if (value === undefined) {
      if (codec.clearable !== true) {
        throw new InvalidInputError(`Field '${field}' is required and cannot be cleared`);
      }

      sets.push(`${codec.column} = NULL`);
      continue;
    }

    sets.push(`${codec.column} = ?`);
    params.push(codec.encode ? codec.encode(value) : (value as SqlValue));
  }

  return { sql: sets.join(', '), params };
}

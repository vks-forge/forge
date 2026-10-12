/**
 * Patch validation shared by both adapters, plus the SQL SET builder.
 *
 * Why: ticket, run and interaction patches cross the storage boundary, so they are
 *   parsed with the core zod schemas (code.md rule 4) before touching a row. The CAS
 *   version rule lives here once so sqlite and memory cannot drift: a patch without
 *   `status_version` bumps it by one, otherwise the CAS would never invalidate readers
 *   (director-core.md §3).
 *
 * Exports: parseTicketPatch(), parseRunPatch(), parseInteractionPatch(), buildSetClause().
 * Depends on: @forge/core, types/storage-driver.types. No IO.
 */

import { Interaction, InvalidInputError, Run, Ticket } from '@forge/core';
import type { TicketPatch } from '@forge/core';
import type { ColumnCodec, SqlValue } from '#/types/storage-driver.types.js';

const TicketPatchSchema = Ticket.omit({ id: true, project: true, created_at: true })
  .partial()
  .strict();
const RunPatchSchema = Run.omit({ id: true }).partial().strict();
const InteractionPatchSchema = Interaction.omit({ id: true }).partial().strict();

/** Validate a ticket patch and default `status_version` to expectedVersion + 1. */
export function parseTicketPatch(
  expectedVersion: number,
  patch: TicketPatch,
): Partial<Ticket> {
  const parsed = TicketPatchSchema.parse(patch) as Partial<Ticket>;
  return { ...parsed, status_version: parsed.status_version ?? expectedVersion + 1 };
}

export function parseRunPatch(patch: Partial<Omit<Run, 'id'>>): Partial<Omit<Run, 'id'>> {
  return RunPatchSchema.parse(patch) as Partial<Omit<Run, 'id'>>;
}

export function parseInteractionPatch(
  patch: Partial<Omit<Interaction, 'id'>>,
): Partial<Omit<Interaction, 'id'>> {
  return InteractionPatchSchema.parse(patch) as Partial<Omit<Interaction, 'id'>>;
}

/** Build `col = ?, ...` and its params from a parsed patch; unknown fields are a bug. */
export function buildSetClause(
  codecs: Readonly<Record<string, ColumnCodec>>,
  patch: object,
): { sql: string; params: SqlValue[] } {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const codec = codecs[field];
    if (!codec) throw new InvalidInputError(`No column mapped for field '${field}'`);
    sets.push(`${codec.column} = ?`);
    params.push(codec.encode ? codec.encode(value) : (value as SqlValue));
  }
  return { sql: sets.join(', '), params };
}

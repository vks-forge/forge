/**
 * Builders for memory rows and history entries used by the memory contract and repository tests.
 *
 * Why: every memory test needs a valid row with a handful of fields changed, and a wrong default
 *   (a pinned flag, a missing source) would hide a real bug behind a fixture mistake. One place keeps the
 *   defaults honest: an active decision by the owner, no tags, no links, nothing imported.
 *
 * Exports: memoryRow(), memoryEvent(), T_MEM.
 * Depends on: @forge/core (types only).
 */

import type { MemoryRow, NewMemoryEvent } from '@forge/core';

export const T_MEM = '2026-10-18T10:00:00.000Z';

/** A valid active decision of project `forge`; `over` replaces fields. */
export function memoryRow(over: Partial<MemoryRow> = {}): MemoryRow {
  return {
    project: 'forge',
    id: 'd-0001',
    kind: 'decision',
    status: 'active',
    statement: 'Use zod schemas as the source of truth',
    body: '',
    source_type: 'chat',
    source_ref: 'the owner said so',
    author: 'user',
    origin: 'owner',
    confidence: null,
    created_at: T_MEM,
    valid_from: '2026-10-18',
    valid_to: null,
    superseded_by: null,
    pinned: false,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    rejected_reason: null,
    gist: null,
    aliases: [],
    imported_from: null,
    raw_front_matter: null,
    lenient_fields: null,
    ...over,
  };
}

/** The history entry of creating an active decision. */
export function memoryEvent(over: Partial<NewMemoryEvent> = {}): NewMemoryEvent {
  return {
    at: T_MEM,
    actor: 'owner',
    event: 'decided',
    from_status: null,
    to_status: 'active',
    reason: null,
    ...over,
  };
}

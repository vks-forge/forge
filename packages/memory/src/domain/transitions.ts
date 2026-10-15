/**
 * Record state moves — approve, reject, supersede as pure functions on a record.
 *
 * Why: the rule that makes memory safe to plan against is that `statement`, `source`,
 *   `author` and `origin` are fixed at write time and never edited (memory-system.md
 *   section 7). Every state change goes through these functions, which spread the old
 *   record and set only status fields, so there is no code path that can touch the
 *   immutable ones, and a proposal that is not pending cannot be approved twice.
 *
 * Exports: approvedRecord(), rejectedRecord(), supersededRecord().
 * Depends on: @forge/core (MemoryRecord, memory errors). Pure, no IO.
 */

import { MemoryRecordStateError } from '@forge/core';
import type { MemoryRecord } from '@forge/core';

function requirePending(record: MemoryRecord): void {
  if (record.kind !== 'proposal' || record.status !== 'pending') {
    throw new MemoryRecordStateError(
      record.id,
      `${record.id} is not a pending proposal (it is ${record.kind}, ${record.status})`,
    );
  }
}

/** A pending proposal becomes an active decision; the id is kept. */
export function approvedRecord(
  record: MemoryRecord,
  by: string,
  at: string,
): MemoryRecord {
  requirePending(record);

  return {
    ...record,
    kind: 'decision',
    status: 'active',
    approved_at: at,
    approved_by: by,
  };
}

/** A pending proposal becomes a rejected approach with the reason; the id is kept. */
export function rejectedRecord(
  record: MemoryRecord,
  by: string,
  at: string,
  reason: string,
): MemoryRecord {
  requirePending(record);

  return {
    ...record,
    kind: 'rejected',
    status: 'rejected',
    rejected_at: at,
    rejected_by: by,
    rejected_reason: reason,
  };
}

/** An active decision is replaced by `newId`; only an active decision can be superseded. */
export function supersededRecord(
  record: MemoryRecord,
  newId: string,
  at: string,
): MemoryRecord {
  if (record.kind !== 'decision' || record.status !== 'active') {
    throw new MemoryRecordStateError(
      record.id,
      `${record.id} is not an active decision (it is ${record.kind}, ${record.status})`,
    );
  }

  return { ...record, status: 'superseded', superseded_by: newId, valid_to: at };
}

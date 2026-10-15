/**
 * Memory write plans — what each Director write puts on disk, as pure functions.
 *
 * Why: every write has the same shape (new or moved record files, one commit subject) and
 *   the same duties: stamp `author` and `status` itself, never take them from the caller,
 *   pick an id that was never used, and move a record through `transitions` so its
 *   immutable fields cannot change. Planning without touching the disk keeps those rules
 *   testable and leaves the adapter with only ordering, atomicity and the commit.
 *
 * Exports: planPropose(), planDecide(), planApprove(), planReject(), planSupersede(),
 *   planOutcome().
 * Depends on: @forge/core (schemas, errors), domain/record-file, domain/record-ids,
 *   domain/transitions, types/project-memory. Pure, no IO.
 */

import {
  DecisionInput,
  InvalidInputError,
  MemoryRecordNotFoundError,
  ProposalInput,
} from '@forge/core';
import type { MemoryRecord } from '@forge/core';
import { nextRecordId } from '#/domain/record-ids.js';
import { recordFileName, renderRecordFile } from '#/domain/record-file.js';
import {
  approvedRecord,
  rejectedRecord,
  supersededRecord,
} from '#/domain/transitions.js';
import type { PlannedChange, StoredRecord } from '#/types/project-memory.types.js';

const SUBJECT_STATEMENT_MAX = 60;
const OUTCOME_STATEMENT_MAX = 200;

const short = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim();

  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const idsOf = (records: readonly StoredRecord[]): string[] =>
  records.map((r) => r.record.id);

function findRecord(records: readonly StoredRecord[], id: string): StoredRecord {
  const found = records.find((r) => r.record.id === id);
  if (!found) {
    throw new MemoryRecordNotFoundError(id);
  }

  return found;
}

function newDecision(
  id: string,
  input: DecisionInput,
  at: string,
  supersedes: string | null,
): MemoryRecord {
  return {
    id,
    kind: 'decision',
    statement: input.statement,
    source: input.source,
    author: 'user',
    origin: input.origin ?? 'owner',
    status: 'active',
    valid_from: at,
    superseded_by: null,
    supersedes,
    tags: input.tags ?? [],
    pinned: input.pinned ?? true,
  };
}

/** `proposed/x-NNNN`, pending, authored by the director. */
export function planPropose(
  records: readonly StoredRecord[],
  at: string,
  raw: unknown,
): PlannedChange {
  const input = ProposalInput.parse(raw);
  const id = nextRecordId('x', idsOf(records));
  const record: MemoryRecord = {
    id,
    kind: 'proposal',
    statement: input.statement,
    source: input.source,
    author: 'director',
    origin: input.origin ?? 'agent',
    status: 'pending',
    valid_from: at,
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    tags: input.tags ?? [],
    pinned: false,
  };

  return {
    id,
    subject: `memory: propose ${id}: ${short(input.statement, SUBJECT_STATEMENT_MAX)}`,
    write: new Map([
      [
        `proposed/${recordFileName(id, input.statement)}`,
        renderRecordFile(record, input.body ?? ''),
      ],
    ]),
    remove: [],
  };
}

/** `decisions/d-NNNN`, active, authored by the user. */
export function planDecide(
  records: readonly StoredRecord[],
  at: string,
  raw: unknown,
): PlannedChange {
  const input = DecisionInput.parse(raw);
  const id = nextRecordId('d', idsOf(records));

  return {
    id,
    subject: `memory: decide ${id}: ${short(input.statement, SUBJECT_STATEMENT_MAX)}`,
    write: new Map([
      [
        `decisions/${recordFileName(id, input.statement)}`,
        renderRecordFile(newDecision(id, input, at, null), input.body ?? ''),
      ],
    ]),
    remove: [],
  };
}

/** Moves a pending proposal into `decisions/`, keeping its id and body. */
export function planApprove(
  records: readonly StoredRecord[],
  at: string,
  id: string,
  by: string,
): PlannedChange {
  const found = findRecord(records, id);
  const record = approvedRecord(found.record, by, at);

  return {
    id,
    subject: `memory: approve ${id} (by ${short(by, 40)})`,
    write: new Map([
      [
        `decisions/${recordFileName(id, record.statement)}`,
        renderRecordFile(record, found.body),
      ],
    ]),
    remove: [found.relPath],
  };
}

/** Moves a pending proposal into `rejected/` with the reason, keeping its id and body. */
export function planReject(
  records: readonly StoredRecord[],
  at: string,
  id: string,
  reason: string,
  by: string,
): PlannedChange {
  const why = reason.trim();
  if (why === '') {
    throw new InvalidInputError('a rejection needs a reason');
  }

  const found = findRecord(records, id);
  const record = rejectedRecord(found.record, by, at, why);

  return {
    id,
    subject: `memory: reject ${id} (by ${short(by, 40)}): ${short(why, SUBJECT_STATEMENT_MAX)}`,
    write: new Map([
      [
        `rejected/${recordFileName(id, record.statement)}`,
        renderRecordFile(record, found.body),
      ],
    ]),
    remove: [found.relPath],
  };
}

/** A new decision that supersedes `oldId`, and the old record marked superseded in place. */
export function planSupersede(
  records: readonly StoredRecord[],
  at: string,
  oldId: string,
  raw: unknown,
): PlannedChange {
  const input = DecisionInput.parse(raw);
  const old = findRecord(records, oldId);
  const id = nextRecordId('d', idsOf(records));
  const retired = supersededRecord(old.record, id, at);

  return {
    id,
    subject: `memory: supersede ${oldId} with ${id}: ${short(input.statement, SUBJECT_STATEMENT_MAX)}`,
    write: new Map([
      [old.relPath, renderRecordFile(retired, old.body)],
      [
        `decisions/${recordFileName(id, input.statement)}`,
        renderRecordFile(newDecision(id, input, at, oldId), input.body ?? ''),
      ],
    ]),
    remove: [],
  };
}

/** `outcomes/YYYY-MM/o-NNNN`; the first line of the text is its statement. */
export function planOutcome(
  records: readonly StoredRecord[],
  at: string,
  text: string,
): PlannedChange {
  const body = text.trim();
  if (body === '') {
    throw new InvalidInputError('an outcome needs text');
  }

  const id = nextRecordId('o', idsOf(records));
  const statement = short(body.split('\n')[0] ?? body, OUTCOME_STATEMENT_MAX);
  const record: MemoryRecord = {
    id,
    kind: 'outcome',
    statement,
    source: { type: 'system', ref: 'director outcome' },
    author: 'director',
    origin: 'system',
    status: 'active',
    valid_from: at,
    tags: [],
    pinned: false,
  };

  return {
    id,
    subject: `memory: outcome ${id}: ${short(statement, SUBJECT_STATEMENT_MAX)}`,
    write: new Map([
      [
        `outcomes/${at.slice(0, 7)}/${recordFileName(id, statement)}`,
        renderRecordFile(record, body),
      ],
    ]),
    remove: [],
  };
}

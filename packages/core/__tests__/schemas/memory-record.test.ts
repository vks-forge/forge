/**
 * Memory record schema tests — what a record and a writer input may look like.
 *
 * Why: a record's author and origin decide whether the Director may treat it as the
 *   owner's word, so the schema must reject an author or id outside the closed sets and
 *   must not let a proposal claim more than the Director's confidence cap. Writer inputs
 *   carry no author, status or id at all.
 *
 * Pins: MemoryRecord, MemoryListEntry, ProposalInput, DecisionInput.
 * Depends on: schemas/memory-record, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  DecisionInput,
  MemoryListEntry,
  MemoryRecord,
  ProposalInput,
} from '#/schemas/memory-record.js';

const record = {
  id: 'd-0001',
  kind: 'decision',
  statement: 'Use zod',
  source: { type: 'chat', ref: 'ok' },
  author: 'user',
  origin: 'owner',
  status: 'active',
  valid_from: '2026-10-15',
};

describe('MemoryRecord', () => {
  it('fills tags and pinned, and keeps unknown fields', () => {
    const parsed = MemoryRecord.parse({ ...record, amends: ['d-0007'] });

    expect(parsed).toMatchObject({ tags: [], pinned: false, amends: ['d-0007'] });
  });

  it.each([
    ['an id that is not letter-dash-four-digits', { id: 'decision-1' }],
    ['an author outside user and director', { author: 'worker' }],
    ['an empty statement', { statement: '  ' }],
    ['an unknown status', { status: 'maybe' }],
  ])('rejects %s', (_name, patch) => {
    expect(MemoryRecord.safeParse({ ...record, ...patch }).success).toBe(false);
  });

  it('the list entry carries only id, kind, status, statement and tags', () => {
    expect(Object.keys(MemoryListEntry.parse(record)).sort()).toEqual([
      'id',
      'kind',
      'statement',
      'status',
      'tags',
    ]);
  });
});

describe('writer inputs', () => {
  it('a proposal cannot be more confident than 0.8', () => {
    const base = { statement: 'x', source: { type: 'chat', ref: 'y' } };

    expect(ProposalInput.safeParse({ ...base, confidence: 0.8 }).success).toBe(true);
    expect(ProposalInput.safeParse({ ...base, confidence: 0.9 }).success).toBe(false);
  });

  it('neither input can carry an author or status of its own', () => {
    const base = { statement: 'x', source: { type: 'chat', ref: 'y' } };

    expect(DecisionInput.parse({ ...base, author: 'user', status: 'active' })).toEqual(
      base,
    );

    expect(ProposalInput.parse({ ...base, author: 'user', status: 'active' })).toEqual(
      base,
    );
  });
});

/**
 * Record state-move tests — approve, reject and supersede never touch the immutable fields.
 *
 * Why: memory is safe to plan against only if `statement`, `source`, `author` and `origin`
 *   are exactly what was written; a state change that could alter them would let an
 *   inference be laundered into an owner decision. A proposal answered twice must also
 *   fail, so a late approval cannot overwrite an earlier rejection.
 *
 * Pins: approvedRecord, rejectedRecord, supersededRecord and their state guards,
 *   immutable fields over awkward statements.
 * Depends on: domain/transitions, @forge/core, vitest. No IO.
 */

import { MemoryRecordStateError } from '@forge/core';
import type { MemoryRecord } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  approvedRecord,
  rejectedRecord,
  supersededRecord,
} from '#/domain/transitions.js';

const proposal = (statement = 'Use pnpm'): MemoryRecord => ({
  id: 'x-0003',
  kind: 'proposal',
  statement,
  source: { type: 'chat', ref: 'inferred' },
  author: 'director',
  origin: 'agent',
  status: 'pending',
  valid_from: '2026-10-15T00:00:00.000Z',
  tags: [],
  pinned: false,
});

const IMMUTABLE = ['statement', 'source', 'author', 'origin', 'id'] as const;
const pick = (r: MemoryRecord) => IMMUTABLE.map((k) => r[k]);

describe('state moves', () => {
  it('approves a pending proposal into an active decision, keeping the id', () => {
    const out = approvedRecord(proposal(), 'vikash', '2026-10-16T00:00:00.000Z');

    expect(out).toMatchObject({
      id: 'x-0003',
      kind: 'decision',
      status: 'active',
      approved_at: '2026-10-16T00:00:00.000Z',
      approved_by: 'vikash',
    });
  });

  it('rejects a pending proposal with the reason', () => {
    const out = rejectedRecord(
      proposal(),
      'vikash',
      '2026-10-16T00:00:00.000Z',
      'too risky',
    );

    expect(out).toMatchObject({
      kind: 'rejected',
      status: 'rejected',
      rejected_reason: 'too risky',
      rejected_by: 'vikash',
    });
  });

  it('refuses to answer a proposal twice', () => {
    const approved = approvedRecord(proposal(), 'a', 't');

    expect(() => approvedRecord(approved, 'b', 't')).toThrow(MemoryRecordStateError);
    expect(() => rejectedRecord(approved, 'b', 't', 'r')).toThrow(MemoryRecordStateError);
  });

  it('supersedes only an active decision', () => {
    const decision = approvedRecord(proposal(), 'a', 't');
    const out = supersededRecord(decision, 'd-0009', '2026-10-17T00:00:00.000Z');

    expect(out).toMatchObject({
      status: 'superseded',
      superseded_by: 'd-0009',
      valid_to: '2026-10-17T00:00:00.000Z',
    });

    expect(() => supersededRecord(out, 'd-0010', 't')).toThrow(MemoryRecordStateError);
    expect(() => supersededRecord(proposal(), 'd-0010', 't')).toThrow(
      MemoryRecordStateError,
    );
  });

  it('leaves statement, source, author, origin and id alone for any statement', () => {
    for (const statement of [
      'a',
      'with: colon',
      '"quoted"',
      'multi\nline',
      '- dash',
      '# hash',
    ]) {
      const p = proposal(statement);
      const approved = approvedRecord(p, 'u', 't');

      expect(pick(approved)).toEqual(pick(p));
      expect(pick(rejectedRecord(p, 'u', 't', 'r'))).toEqual(pick(p));
      expect(pick(supersededRecord(approved, 'd-0001', 't'))).toEqual(pick(p));
    }
  });
});

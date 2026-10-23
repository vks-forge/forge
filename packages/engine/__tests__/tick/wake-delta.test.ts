/**
 * Tests for the wake delta: what a restarted Worker is told changed since its last run.
 *
 * Why: a Worker started again must be told why, in the words that were stored, never a paraphrase.
 *   A clash with main is a new reason: the delta must say `merge_conflict` with the files, who changed
 *   them first and the owner's note on a retry, and must not read as a gate rework (the Worker would
 *   hunt for failed checks) or as a plain retry (it would not know about the markers).
 *
 * Pins: a merge_conflict continuation wake -> `merge_conflict` with files, upstream, note and the
 *   previous run; a damaged conflict reason falls back to a rework; the other kinds are unchanged
 *   (rework, owner rework, retry with a note, new ticket).
 * Depends on: src/tick/wake-delta, src/domain/conflict-wake, @forge/core, vitest. No IO.
 */

import type { Ticket, WakeRequest } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { conflictWakeReason } from '#/domain/conflict-wake.js';
import { wakeDelta } from '#/tick/wake-delta.js';
import type { Candidate } from '#/types/tick.types.js';

const wake = (
  reason: string,
  kind: WakeRequest['kind'] = 'continuation',
): WakeRequest => ({
  id: 'w1',
  ticket_id: 'FG-1',
  reason,
  kind,
  idempotency_key: 'run-3~writer',
  coalesced_count: 0,
  status: 'pending',
  created_at: '2026-10-20T00:00:00.000Z',
});

const candidate = (
  w: WakeRequest | undefined,
  kind: Candidate['kind'] = 'retry',
): Candidate => ({
  ticket: { id: 'FG-1' } as Ticket,
  kind,
  ...(w ? { wake: w } : {}),
});

describe('wakeDelta: merge conflict', () => {
  it('names the clash, who changed the files first and the owner note', () => {
    const reason = conflictWakeReason({
      files: [{ path: 'src/cli.ts' }],
      upstream: [{ ref: 'abcdef01', ticket_id: 'FG-7', title: 'Add the export flag' }],
      note: 'Keep both flags.',
    });

    expect(wakeDelta(candidate(wake(reason)), null)).toEqual({
      kind: 'merge_conflict',
      files: [{ path: 'src/cli.ts' }],
      upstream: [{ ref: 'abcdef01', ticket_id: 'FG-7', title: 'Add the export flag' }],
      note: 'Keep both flags.',
      previous_run: 'run-3',
    });
  });

  it('reads a damaged conflict reason as an ordinary rework', () => {
    const delta = wakeDelta(candidate(wake('merge_conflict: {oops')), null);

    expect(delta['kind']).toBe('rework');
  });
});

describe('wakeDelta: the other kinds', () => {
  it('keeps rework, owner rework, retry with a note and new ticket as they were', () => {
    expect(wakeDelta(candidate(wake('gate_failed: tests red')), null)).toMatchObject({
      kind: 'rework',
      gate_findings: 'tests red',
    });

    expect(wakeDelta(candidate(wake('owner_rework: nicer')), null)).toMatchObject({
      kind: 'rework',
      owner_comment: 'nicer',
    });

    expect(wakeDelta(candidate(wake('owner_retry: go on', 'retry')), null)).toMatchObject(
      { kind: 'retry', note: 'go on' },
    );

    expect(wakeDelta(candidate(undefined, 'new'), null)).toEqual({ kind: 'new_ticket' });
  });
});

describe('wakeDelta: a retry carries its context', () => {
  const ctx = {
    findings: '- [high] src/a.ts:3: no zod (evidence: imports zod)',
    escalation: { kind: 'failure', summary: 'Review kept finding the zod import.' },
    last_run: { run: 'run-2', outcome: 'success' },
  };

  it('adds the findings, the escalation and the last run to an owner retry', () => {
    const delta = wakeDelta(
      candidate(wake('owner_retry: go on', 'retry')),
      null,
      undefined,
      [],
      ctx,
    );

    expect(delta).toMatchObject({
      kind: 'retry',
      note: 'go on',
      ...ctx,
      previous_run: 'run-2',
    });
  });

  it('still works with no history', () => {
    expect(wakeDelta(candidate(wake('owner_retry', 'retry')), null)).toEqual({
      kind: 'retry',
      reason: 'owner_retry',
      previous_run: null,
    });
  });
});

/**
 * Tests for the conflict wake: the reason a clash travels in and the ticket ids read from main's subjects.
 *
 * Why: the clash reaches the resolver Worker through a durable wake reason, and the owner's Retry
 *   rebuilds the same wake from the escalation payload. A reason that does not round-trip, or a
 *   damaged one read as a conflict, would start a Worker with the wrong brief. Squash-merge subjects
 *   name the Forge ticket (`feat(FR-6): title (#12)`); only those name an upstream ticket.
 *
 * Pins: reason round trip, damaged or foreign reasons read as null, ticket id from a subject,
 *   payload conversion both ways (the owner's note joins the rebuilt wake).
 * Depends on: domain/conflict-wake, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  conflictFromPayload,
  conflictPayload,
  conflictWakeReason,
  parseConflictWake,
  upstreamTicketId,
} from '#/domain/conflict-wake.js';
import type { ConflictInfo } from '#/schemas/conflict.js';

const info: ConflictInfo = {
  files: [{ path: 'src/cli.ts' }, { path: 'logo.png', binary: true }],
  upstream: [{ ref: 'abcdef01', ticket_id: 'FR-6', title: 'Add the export flag' }],
};

describe('conflict wake reason', () => {
  it('round-trips through the wake reason', () => {
    expect(parseConflictWake(conflictWakeReason(info))).toEqual(info);
  });

  it.each([
    undefined,
    'owner_retry: x',
    'merge_conflict: {not json',
    'merge_conflict: {"files":1}',
  ])('reads %s as no conflict', (reason) => {
    expect(parseConflictWake(reason)).toBeNull();
  });
});

describe('upstreamTicketId', () => {
  it.each([
    ['feat(FR-6): Add the export flag (#12)', 'FR-6'],
    ['fix(SF-123)!: break it', 'SF-123'],
    ['Merge pull request #3 from x/y', undefined],
    ['chore: bump deps', undefined],
  ])('%s -> %s', (subject, id) => {
    expect(upstreamTicketId(subject)).toBe(id);
  });
});

describe('escalation payload conversion', () => {
  it('keeps paths and upstream tickets, and carries the owner note back into the wake', () => {
    const payload = conflictPayload(info);

    expect(payload).toEqual({
      files: ['src/cli.ts', 'logo.png'],
      upstream: [{ ref: 'abcdef01', ticket_id: 'FR-6', title: 'Add the export flag' }],
    });

    expect(conflictFromPayload(payload, 'keep both')).toEqual({
      files: [{ path: 'src/cli.ts' }, { path: 'logo.png' }],
      upstream: payload.upstream,
      note: 'keep both',
    });
  });
});

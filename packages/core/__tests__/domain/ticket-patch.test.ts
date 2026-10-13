/**
 * Tests for toTicketPatch.
 *
 * Why: the patch built from a transitioned ticket is what clears `blocked_reason` and
 *   `tier_actual` in storage. If the clears were dropped or `status_version` copied, a
 *   ticket could keep a stale gate pass or fight storage over its own version.
 *
 * Pins: immutable and storage-owned fields are left out, cleared optionals stay as
 *   present-but-undefined keys.
 * Depends on: src/domain/ticket-patch, src/domain/state-machine, helpers/fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { transition } from '#/domain/state-machine.js';
import { toTicketPatch } from '#/domain/ticket-patch.js';
import { makeTicket, T0 } from '#tests/helpers/fixtures.js';

describe('toTicketPatch', () => {
  it('drops id, project, created_at and status_version', () => {
    const patch = toTicketPatch(makeTicket({ status_version: 4 }));
    for (const k of ['id', 'project', 'created_at', 'status_version'])
      expect(k in patch).toBe(false);
    expect(patch.title).toBe('Add doctor check');
  });

  it('keeps cleared optionals as explicit undefined keys', () => {
    const r = transition(makeTicket({ status: 'blocked', blocked_reason: 'dep' }), {
      type: 'unblocked',
      at: T0,
    });
    if (!r.ok) throw new Error('expected ok');
    const patch = toTicketPatch(r.value);
    expect('blocked_reason' in patch && patch.blocked_reason === undefined).toBe(true);
    expect('tier_actual' in patch).toBe(true);
  });
});

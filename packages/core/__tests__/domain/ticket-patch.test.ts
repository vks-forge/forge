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
import { makeTicketId } from '#/domain/ids.js';
import { transition } from '#/domain/state-machine.js';
import { toTicketPatch } from '#/domain/ticket-patch.js';
import { makeTicket, T0 } from '#tests/helpers/fixtures.js';

describe('toTicketPatch', () => {
  it('drops id, project, created_at and status_version', () => {
    const patch = toTicketPatch(makeTicket({ status_version: 4 }));
    for (const k of ['id', 'project', 'created_at', 'status_version']) {
      expect(k in patch).toBe(false);
    }

    expect(patch.title).toBe('Add doctor check');
  });

  it('keeps cleared optionals as explicit undefined keys', () => {
    const r = transition(makeTicket({ status: 'blocked', blocked_reason: 'dep' }), {
      type: 'unblocked',
      at: T0,
    });

    if (!r.ok) {
      throw new Error('expected ok');
    }

    const patch = toTicketPatch(r.value);
    expect('blocked_reason' in patch && patch.blocked_reason === undefined).toBe(true);
    expect('tier_actual' in patch).toBe(true);
  });

  it('leaves relations to the relation repository: parent and blocked_by are not patched', () => {
    const patch = toTicketPatch(makeTicket({ blocked_by: [makeTicketId('SF', 2)] }));
    expect('parent' in patch).toBe(false);
    expect('blocked_by' in patch).toBe(false);
  });

  it('clears every nullable engine field that the ticket lacks', () => {
    const patch = toTicketPatch(makeTicket());
    for (const k of [
      'assignee_run_id',
      'branch',
      'worktree',
      'checkout_run_id',
      'epic_id',
      'created_by_intake',
      'pr_number',
      'pr_url',
    ]) {
      expect(k in patch, k).toBe(true);
      expect((patch as Record<string, unknown>)[k], k).toBeUndefined();
    }
  });

  it('carries the engine fields a transitioned ticket has', () => {
    const patch = toTicketPatch(
      makeTicket({ branch: 'feat/SF-1-x', assignee_run_id: 'r1' }),
    );

    expect(patch).toMatchObject({ branch: 'feat/SF-1-x', assignee_run_id: 'r1' });
  });
});

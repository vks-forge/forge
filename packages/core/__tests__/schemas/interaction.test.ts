/**
 * Tests for the Interaction schema.
 *
 * Why: the interactions row is the durable reason a ticket is parked waiting for a
 *   human. If unknown kinds or statuses parsed, the Director could not tell a pending
 *   question from a corrupt one and the "Needs you" pane would drift from storage
 *   (director-core.md §3, §8).
 *
 * Pins: a pending interaction parses; unknown kinds and statuses are rejected
 *   (director-core.md §3 `interactions`).
 * Depends on: src/schemas/interaction, vitest.
 */

import { describe, expect, it } from 'vitest';
import { Interaction } from '#/schemas/interaction.js';

describe('Interaction', () => {
  const base = {
    id: 'i1',
    ticket_id: 'SF-1',
    run_id: 'r1',
    kind: 'question',
    payload: { prompt: 'which db?' },
    status: 'pending',
    asked_at: '2026-10-13T00:00:00.000Z',
    timeout_at: '2026-10-13T04:00:00.000Z',
  };

  it('parses a pending interaction', () => {
    expect(Interaction.safeParse(base).success).toBe(true);
  });

  it('accepts the blocked kind (report_blocked) next to question, plan_confirm and permission', () => {
    for (const kind of ['question', 'plan_confirm', 'permission', 'blocked'])
      expect(Interaction.safeParse({ ...base, kind }).success).toBe(true);
  });

  it('rejects unknown kinds and statuses', () => {
    expect(Interaction.safeParse({ ...base, kind: 'chat' }).success).toBe(false);
    expect(Interaction.safeParse({ ...base, status: 'maybe' }).success).toBe(false);
  });
});

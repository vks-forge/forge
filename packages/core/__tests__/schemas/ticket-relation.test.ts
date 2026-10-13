/**
 * Tests for the ticket relation schema.
 *
 * Why: `ticket_relations` is the single source of truth for parent and blocked-by links. A self relation or malformed id would make a ticket block itself or point at nothing (director-core.md §3).
 *
 * Pins: TicketRelation parses a relation and rejects self relations, unknown kinds and malformed ids.
 * Depends on: src/schemas/ticket-relation, vitest.
 */

import { describe, expect, it } from 'vitest';
import { TicketRelation } from '#/schemas/ticket-relation.js';

const ts = '2026-10-13T00:00:00.000Z';

describe('TicketRelation', () => {
  it('parses a relation between two tickets', () => {
    const r = { from_id: 'SF-1', to_id: 'SF-2', kind: 'depends_on' };
    expect(TicketRelation.safeParse(r).success).toBe(true);
    expect(TicketRelation.safeParse({ ...r, created_at: ts }).success).toBe(true);
  });

  it('rejects a self relation, an unknown kind and a malformed id', () => {
    expect(
      TicketRelation.safeParse({ from_id: 'SF-1', to_id: 'SF-1', kind: 'blocks' })
        .success,
    ).toBe(false);
    expect(
      TicketRelation.safeParse({ from_id: 'SF-1', to_id: 'SF-2', kind: 'likes' }).success,
    ).toBe(false);
    expect(
      TicketRelation.safeParse({ from_id: 'sf-1', to_id: 'SF-2', kind: 'blocks' })
        .success,
    ).toBe(false);
  });
});

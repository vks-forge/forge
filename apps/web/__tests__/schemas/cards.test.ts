/**
 * Pins: a card read from the current server, which sends `open_points: null` and
 * `plan_version: null` for a card with no grill or plan yet, parses, and both fields read as
 * absent; an older server that omits them parses the same way.
 *
 * Why: one card that fails to parse fails the whole Board list, and the owner sees "Forge sent
 *   something this version cannot read" instead of their cards. The server is the source of the
 *   shape, so the web schema must accept every value the server sends.
 * Depends on: schemas/cards.
 */

import { describe, expect, it } from 'vitest';
import { CardListReply } from '#/schemas/cards.js';

const card = {
  id: 'DCP-C1',
  project: 'demo-checking-project',
  type: 'issue',
  title: 'i want to create a TODO application',
  summary: 'i want to create a TODO application',
  source: { kind: 'chat', ref: 'a13b1349-b4dc-4a86-9e0e-884f51d4fbcf' },
  created_by: { type: 'user', id: 'web' },
  created_at: '2026-10-16T09:09:13.919Z',
  updated_at: '2026-10-17T04:29:08.837Z',
  closed_reason: 'stopped by agent',
  phase: 'closed',
  phase_version: 0,
  needs_you: true,
  priority: 'normal',
  links: [],
  column: 'closed',
  depends_on: [],
  blocks: [],
  ticket_count: 1,
  tickets_done: 0,
};

describe('CardListReply', () => {
  it('reads null open points and plan version as absent', () => {
    // Arrange
    const reply = {
      items: [{ ...card, open_points: null, plan_version: null }],
      nextCursor: null,
    };

    // Act
    const parsed = CardListReply.safeParse(reply);

    // Assert
    expect(parsed.success).toBe(true);
    expect(parsed.data?.items[0]?.open_points).toBeUndefined();
    expect(parsed.data?.items[0]?.plan_version).toBeUndefined();
  });

  it('accepts a card from an older server that omits both fields', () => {
    // Arrange
    const reply = { items: [card], nextCursor: null };

    // Act
    const parsed = CardListReply.safeParse(reply);

    // Assert
    expect(parsed.success).toBe(true);
  });

  it('keeps real numbers', () => {
    // Arrange
    const reply = {
      items: [{ ...card, open_points: 3, plan_version: 2 }],
      nextCursor: null,
    };

    // Act
    const parsed = CardListReply.safeParse(reply);

    // Assert
    expect(parsed.data?.items[0]?.open_points).toBe(3);
    expect(parsed.data?.items[0]?.plan_version).toBe(2);
  });
});

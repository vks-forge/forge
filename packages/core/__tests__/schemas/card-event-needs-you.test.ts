/**
 * Tests for the structured fields of the `needs_you` card event.
 *
 * Why: the dock reads `kind`, `title` and `items` instead of splitting a joined reason string,
 *   but history written before those fields exist is still in the database and must keep
 *   loading, and a writer must not be able to store a kind the owner's screens cannot draw.
 *
 * Pins: an old payload (reason and actions only) still parses; the new fields are accepted;
 *   an unknown kind, an over-long title and an empty item are refused.
 * Depends on: src/schemas/card-event, vitest.
 */

import { describe, expect, it } from 'vitest';
import { NewCardEvent } from '#/schemas/card-event.js';

const base = {
  at: '2026-10-19T00:00:00.000Z',
  actor: { type: 'director', id: 'engine' },
  kind: 'needs_you',
};

const old = { reason: 'The Director has a question for you.', actions: ['answer'] };
const parse = (payload: unknown) => NewCardEvent.safeParse({ ...base, payload });

describe('needs_you payload', () => {
  it('parses an event written before the structured fields', () => {
    expect(parse(old).success).toBe(true);
  });

  it('accepts kind, title and items', () => {
    const result = parse({
      ...old,
      kind: 'director_questions',
      title: 'The Director has a question',
      items: ['Which database?'],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['unknown kind', { kind: 'gossip' }],
    ['long title', { title: 'x'.repeat(81) }],
    ['empty item', { items: [''] }],
  ])('refuses %s', (_name, extra) => {
    expect(parse({ ...old, ...extra }).success).toBe(false);
  });
});

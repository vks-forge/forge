/**
 * Tests for the card schemas: ids, rows, events, registry entries and API bodies.
 *
 * Why: the card is parsed at every boundary (a storage row, an HTTP body, the card type
 *   registry). A card id that could be read as a ticket id would send a route to the wrong
 *   record; an event whose payload does not match its kind would crash the Card page; a
 *   registry type that parses loosely would let intake accept a source it should refuse; a
 *   PATCH body that allowed `column` would let the Board be moved by hand (d-0107).
 *
 * Pins: card id grammar and its disjointness from ticket ids, make/parse round trip, the
 *   event union per kind, the built-in registry rows, list/events query bounds, and the
 *   patch body rules.
 * Depends on: src/schemas/*, src/domain/ids, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeCardId, parseCardId, parseTicketId } from '#/domain/ids.js';
import { Card } from '#/schemas/card.js';
import { CardEventsQuery, CardListQuery, CardPatchBody } from '#/schemas/card-api.js';
import { NewCardEvent } from '#/schemas/card-event.js';
import { BUILTIN_CARD_TYPES, CardType } from '#/schemas/card-type.js';
import { CardId, TicketId } from '#/schemas/ids.js';

const T = '2026-10-16T00:00:00.000Z';

describe('card ids', () => {
  it('makes <PROJECT>-C<n> and parses it back', () => {
    expect(makeCardId('SF', 12)).toBe('SF-C12');
    expect(parseCardId('SF-C12')).toEqual({ ok: true, value: { project: 'SF', n: 12 } });
  });

  it('never reads as a ticket id, and a ticket id never reads as a card id', () => {
    expect(TicketId.safeParse('SF-C12').success).toBe(false);
    expect(CardId.safeParse('SF-12').success).toBe(false);
    expect(parseTicketId('SF-C12').ok).toBe(false);
    expect(parseCardId('SF-12').ok).toBe(false);
  });

  it('rejects bad prefixes and numbers without throwing on parse', () => {
    expect(() => makeCardId('sf', 1)).toThrow();
    expect(() => makeCardId('SF', 0)).toThrow();
    for (const bad of ['', 'SF-C', 'SF-C0', 'SF-C01', 'sf-C1', 'SF-c1', 'SF-C1-x']) {
      expect(parseCardId(bad).ok).toBe(false);
    }
  });

  it('round-trips make -> parse', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Z][A-Z0-9]{0,9}$/),
        fc.integer({ min: 1, max: 1_000_000 }),
        (prefix, n) => {
          expect(parseCardId(makeCardId(prefix, n))).toEqual({
            ok: true,
            value: { project: prefix, n },
          });
        },
      ),
    );
  });
});

describe('Card', () => {
  const card = {
    id: 'SF-C1',
    project: 'sf',
    type: 'issue',
    title: 'Fix it',
    summary: 'Fix it please',
    source: { kind: 'chat', ref: 'msg-1' },
    created_by: { type: 'user', id: 'u1' },
    created_at: T,
    updated_at: T,
  };

  it('parses a card and keeps optional fields optional', () => {
    const parsed = Card.parse(card);

    expect(parsed.closed_reason).toBeUndefined();
    expect(parsed.budget_cap_usd).toBeUndefined();
  });

  it('refuses an unknown source kind, a bad type name and an empty closing reason', () => {
    expect(Card.safeParse({ ...card, source: { kind: 'fax', ref: 'x' } }).success).toBe(
      false,
    );

    expect(Card.safeParse({ ...card, type: 'Pr-Issue' }).success).toBe(false);
    expect(Card.safeParse({ ...card, closed_reason: '' }).success).toBe(false);
  });
});

describe('NewCardEvent', () => {
  const base = { at: T, actor: { type: 'user', id: 'u1' } };

  it('accepts each kind with its own payload', () => {
    const events = [
      { kind: 'user_message', payload: { text: 'hi' } },
      { kind: 'director_message', payload: { text: 'hello' } },
      { kind: 'ticket_created', payload: { ticket_id: 'SF-1', title: 't' } },
      {
        kind: 'ticket_state',
        payload: { ticket_id: 'SF-1', from: 'inbox', to: 'planned' },
      },
      {
        kind: 'interaction_opened',
        payload: { ticket_id: 'SF-1', interaction_id: 'i', interaction_kind: 'question' },
      },
      {
        kind: 'interaction_answered',
        payload: { ticket_id: 'SF-1', interaction_id: 'i' },
      },
      { kind: 'type_changed', payload: { from: 'discussion', to: 'issue' } },
      { kind: 'card_closed', payload: { reason: 'duplicate' } },
      { kind: 'note', payload: { text: 'n' } },
    ];

    for (const e of events) {
      expect(NewCardEvent.safeParse({ ...base, ...e }).success).toBe(true);
    }
  });

  it('refuses a payload that does not match its kind and an unknown kind', () => {
    expect(
      NewCardEvent.safeParse({ ...base, kind: 'ticket_state', payload: { text: 'x' } })
        .success,
    ).toBe(false);

    expect(
      NewCardEvent.safeParse({
        ...base,
        kind: 'ticket_state',
        payload: { ticket_id: 'SF-1', from: 'inbox', to: 'limbo' },
      }).success,
    ).toBe(false);

    expect(NewCardEvent.safeParse({ ...base, kind: 'shout', payload: {} }).success).toBe(
      false,
    );
  });
});

describe('card type registry entries', () => {
  it('ships discussion, plan, issue and pr_issue, all valid', () => {
    expect(BUILTIN_CARD_TYPES.map((x) => x.name)).toEqual([
      'discussion',
      'plan',
      'issue',
      'pr_issue',
    ]);

    for (const type of BUILTIN_CARD_TYPES) {
      expect(CardType.safeParse(type).success).toBe(true);
    }
  });

  it('starts tickets at intake only for issue and pr_issue, and asks plan approval only for plan', () => {
    const by = Object.fromEntries(BUILTIN_CARD_TYPES.map((x) => [x.name, x]));

    expect(by['discussion']?.tickets_on_intake).toBe(false);
    expect(by['plan']?.tickets_on_intake).toBe(false);
    expect(by['plan']?.plan_approval).toBe(true);
    expect(by['issue']?.tickets_on_intake).toBe(true);
    expect(by['pr_issue']?.tickets_on_intake).toBe(true);
  });

  it('requires at least one allowed source', () => {
    const type = { ...BUILTIN_CARD_TYPES[0], allowed_sources: [] };

    expect(CardType.safeParse(type).success).toBe(false);
  });
});

describe('card API bodies', () => {
  it('defaults and bounds the list and history queries', () => {
    expect(CardListQuery.parse({}).limit).toBe(50);
    expect(CardListQuery.safeParse({ limit: '201' }).success).toBe(false);
    expect(CardListQuery.safeParse({ column: 'limbo' }).success).toBe(false);
    expect(CardListQuery.parse({ limit: '7', column: 'needs_you' })).toMatchObject({
      limit: 7,
      column: 'needs_you',
    });

    expect(CardEventsQuery.parse({}).limit).toBe(50);
    expect(CardEventsQuery.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('accepts a type change, a close, or both, and nothing else', () => {
    expect(CardPatchBody.safeParse({ type: 'issue' }).success).toBe(true);
    expect(CardPatchBody.safeParse({ closed_reason: 'duplicate' }).success).toBe(true);
    expect(CardPatchBody.safeParse({ type: 'plan', closed_reason: 'x' }).success).toBe(
      true,
    );

    expect(CardPatchBody.safeParse({}).success).toBe(false);
    expect(CardPatchBody.safeParse({ closed_reason: '   ' }).success).toBe(false);
    expect(CardPatchBody.safeParse({ column: 'done' }).success).toBe(false);
  });
});

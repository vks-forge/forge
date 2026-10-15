/**
 * Tests for the card chat rules: which actions a card type allows, and retype validity.
 *
 * Why: the Director names actions but the card type registry decides what a card may do
 *   (d-0106). A Discussion must not file tickets until converted, a type without `close`
 *   must not be suggested closed, and the retype check is the same one the PATCH route
 *   applies, so the Director cannot do what the owner could not.
 *
 * Pins: the allowed kinds of each built-in type; each refusal reason; a type without `chat`
 *   allows nothing; unknown type and refused source in checkTypeChange.
 * Depends on: src/domain/card-chat-actions, src/schemas/card-type, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  allowedChatActions,
  chatActionRefusal,
  checkTypeChange,
} from '#/domain/card-chat-actions.js';
import { BUILTIN_CARD_TYPES } from '#/schemas/card-type.js';
import type { CardType } from '#/schemas/card-type.js';

const type = (name: string): CardType => {
  const found = BUILTIN_CARD_TYPES.find((t) => t.name === name);
  if (!found) {
    throw new Error(name);
  }

  return found;
};

describe('allowedChatActions', () => {
  it('lets a Discussion and a Plan steer, convert and suggest close, but not file tickets', () => {
    for (const name of ['discussion', 'plan']) {
      expect(allowedChatActions(type(name))).toEqual([
        'steer_run',
        'change_type',
        'suggest_close',
      ]);
    }
  });

  it('lets an Issue and a PR issue do all four', () => {
    for (const name of ['issue', 'pr_issue']) {
      expect(allowedChatActions(type(name))).toEqual([
        'create_ticket',
        'steer_run',
        'change_type',
        'suggest_close',
      ]);
    }
  });

  it('allows nothing for a type without chat', () => {
    expect(allowedChatActions({ ...type('issue'), actions: ['close'] })).toEqual([]);
  });

  it('drops change_type without convert and suggest_close without close', () => {
    const t = { ...type('issue'), actions: ['chat'] };

    expect(allowedChatActions(t)).toEqual(['create_ticket', 'steer_run']);
    expect(chatActionRefusal(t, 'change_type')).toMatch(/cannot be converted/);
    expect(chatActionRefusal(t, 'suggest_close')).toMatch(/cannot be closed/);
  });

  it('says why a Discussion cannot file tickets', () => {
    expect(chatActionRefusal(type('discussion'), 'create_ticket')).toMatch(
      /do not start tickets/,
    );
  });
});

describe('checkTypeChange', () => {
  it('accepts a type that takes the card source', () => {
    const card = { source: { kind: 'chat', ref: 'm' } } as const;

    expect(checkTypeChange(card, type('issue'), 'issue')).toEqual({ ok: true });
  });

  it('refuses an unknown type and a source the type does not accept', () => {
    const card = { source: { kind: 'cron', ref: 'c' } } as const;

    expect(checkTypeChange(card, null, 'epic')).toMatchObject({
      ok: false,
      code: 'unknown_card_type',
    });

    expect(checkTypeChange(card, type('discussion'), 'discussion')).toMatchObject({
      ok: false,
      code: 'card_type_source',
    });
  });
});

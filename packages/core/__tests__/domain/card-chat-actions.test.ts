/**
 * Tests for the card chat rules: which actions a card type allows, and retype validity.
 *
 * Why: the Director names actions but the card type registry decides what a card may do
 *   (d-0106), and the card's phase decides whether tickets may exist yet: none while the
 *   plan is being shaped or awaits approval (d-0141). A type without `close` must not be
 *   suggested closed, and the retype check is the same one the PATCH route applies, so the
 *   Director cannot do what the owner could not.
 *
 * Pins: the allowed kinds per type and phase; each refusal reason; a type without `chat`
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

// Ticket edits and cancels are allowed in every phase: they only touch tickets that already exist.
const TICKET_EDITS = [
  'set_ticket_dependencies',
  'set_ticket_priority',
  'edit_ticket_description',
  'cancel_ticket',
];

describe('allowedChatActions', () => {
  it('lets every type do every action once the plan is approved', () => {
    for (const name of ['discussion', 'plan', 'issue', 'pr_issue']) {
      expect(allowedChatActions(type(name), 'approved')).toEqual([
        'create_ticket',
        'steer_run',
        'change_type',
        'suggest_close',
        ...TICKET_EDITS,
      ]);
    }
  });

  it.each(['grilling', 'verifying', 'plan_ready'] as const)(
    'withholds create_ticket while the card is %s',
    (phase) => {
      expect(allowedChatActions(type('plan'), phase)).toEqual([
        'steer_run',
        'change_type',
        'suggest_close',
        ...TICKET_EDITS,
      ]);

      expect(chatActionRefusal(type('issue'), 'create_ticket', phase)).toBe(
        'tickets are created when the plan is approved',
      );
    },
  );

  it('allows nothing for a type without chat', () => {
    expect(
      allowedChatActions({ ...type('issue'), actions: ['close'] }, 'approved'),
    ).toEqual([]);
  });

  it('drops change_type without convert and suggest_close without close', () => {
    const t = { ...type('issue'), actions: ['chat'] };

    expect(allowedChatActions(t, 'in_progress')).toEqual([
      'create_ticket',
      'steer_run',
      ...TICKET_EDITS,
    ]);

    expect(chatActionRefusal(t, 'change_type')).toMatch(/cannot be converted/);
    expect(chatActionRefusal(t, 'suggest_close')).toMatch(/cannot be closed/);
  });

  it('applies only the type rules when no phase is given', () => {
    expect(chatActionRefusal(type('discussion'), 'create_ticket')).toBeNull();
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

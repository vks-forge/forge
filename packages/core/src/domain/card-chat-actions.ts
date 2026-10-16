/**
 * Card chat rules — which Director actions a card type allows, and whether a retype is valid.
 *
 * Why: the Director's reply names actions, but the card type registry decides what a card
 *   may do (d-0106): a Discussion makes no tickets until it is converted, and a card type
 *   without `close` must never be closed by suggestion. One pure function answers "may this
 *   card do this?" for the chat engine and for the prompt (the model is told only the allowed
 *   kinds), so the answer cannot differ between what is offered and what is enforced. The
 *   retype check is shared with `PATCH /cards/:id`, so the owner and the Director are held to
 *   the same source rule. The card's phase gates ticket creation: while the card is being
 *   grilled, verified or has a plan awaiting approval, no ticket may exist, because the
 *   plan is what creates them (d-0128, d-0141 item 1). Fail closed: an unknown type, a
 *   missing registry action or an unknown phase is a no.
 *
 * Exports: allowedChatActions(), chatActionRefusal(), checkTypeChange(), PLANNING_PHASES.
 * Depends on: schemas/card, schemas/card-chat, schemas/card-type, types/card-chat. No IO.
 */

import type { Card, CardPhase } from '#/schemas/card.js';
import type { ChatActionKind } from '#/schemas/card-chat.js';
import { CHAT_ACTION_KINDS } from '#/schemas/card-chat.js';
import type { CardType } from '#/schemas/card-type.js';
import type { TypeChangeCheck } from '#/types/card-chat.types.js';

/** Phases in which a card has no tickets yet: the plan is still being shaped or awaits approval. */
export const PLANNING_PHASES: readonly CardPhase[] = [
  'grilling',
  'verifying',
  'plan_ready',
];

/**
 * Why `kind` is not allowed on a card of `type` in `phase`, or null when it is. Every
 * action needs `chat`; without a `phase` only the type rules apply.
 */
export function chatActionRefusal(
  type: CardType,
  kind: ChatActionKind,
  phase?: CardPhase,
): string | null {
  if (!type.actions.includes('chat')) {
    return `${type.label} cards do not take chat actions`;
  }

  if (
    kind === 'create_ticket' &&
    phase !== undefined &&
    PLANNING_PHASES.includes(phase)
  ) {
    return 'tickets are created when the plan is approved';
  }

  if (kind === 'change_type' && !type.actions.includes('convert')) {
    return `${type.label} cards cannot be converted`;
  }

  if (kind === 'suggest_close' && !type.actions.includes('close')) {
    return `${type.label} cards cannot be closed`;
  }

  return null;
}

/** The action kinds a card of `type` in `phase` allows, in a fixed order. */
export function allowedChatActions(type: CardType, phase?: CardPhase): ChatActionKind[] {
  return CHAT_ACTION_KINDS.filter(
    (kind) => chatActionRefusal(type, kind, phase) === null,
  );
}

/** Whether `card` may be re-filed under `next` (null = the registry has no such type). */
export function checkTypeChange(
  card: Pick<Card, 'source'>,
  next: CardType | null,
  requested: string,
): TypeChangeCheck {
  if (next === null) {
    return {
      ok: false,
      code: 'unknown_card_type',
      message: `no card type ${requested}`,
    };
  }

  if (!next.allowed_sources.includes(card.source.kind)) {
    return {
      ok: false,
      code: 'card_type_source',
      message: `card type ${next.name} does not accept ${card.source.kind}`,
    };
  }

  return { ok: true };
}

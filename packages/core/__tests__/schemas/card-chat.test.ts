/**
 * Tests for the card chat schemas.
 *
 * Why: the chat reply is untrusted model output and the message body comes from a browser.
 *   An action with a missing field must be rejected before the engine acts, an unknown
 *   action kind must not slip through as a free-form command, and a message body with extra
 *   keys or an oversize text must never reach storage.
 *
 * Pins: message body bounds and strictness; each action's required fields; unknown action
 *   kinds and more than five actions are rejected; an empty reply is rejected; the new card
 *   events (`director_message` with actions, `director_action`, `close_suggested`) parse.
 * Depends on: src/schemas/*, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  CARD_MESSAGE_MAX_CHARS,
  CardChatOutput,
  CardDirectorStatus,
  CardMessageBody,
} from '#/schemas/card-chat.js';
import { NewCardEvent } from '#/schemas/card-event.js';

const T = '2026-10-16T00:00:00.000Z';
const director = { type: 'director', id: 'card-chat' };

describe('CardMessageBody', () => {
  it('accepts text and author within bounds', () => {
    expect(CardMessageBody.safeParse({ text: 'hi', author: 'vikash' }).success).toBe(
      true,
    );
  });

  it('rejects empty or oversize text, a blank author and extra keys', () => {
    const bad = [
      { text: '', author: 'a' },
      { text: 'x'.repeat(CARD_MESSAGE_MAX_CHARS + 1), author: 'a' },
      { text: 'hi', author: '' },
      { text: 'hi', author: 'a'.repeat(201) },
      { text: 'hi', author: 'a', card_id: 'FG-C1' },
      { text: 'hi' },
    ];

    for (const body of bad) {
      expect(CardMessageBody.safeParse(body).success).toBe(false);
    }
  });
});

describe('CardChatOutput', () => {
  const reply = 'ok';

  it('accepts a reply alone and each of the four actions', () => {
    const actions = [
      { kind: 'create_ticket', title: 'T', body: 'B', lane: 'express' },
      { kind: 'steer_run', ticket_id: 'FG-1', message: 'go' },
      { kind: 'change_type', type: 'issue' },
      { kind: 'suggest_close', reason: 'dup' },
    ];

    expect(CardChatOutput.safeParse({ reply, actions: [] }).success).toBe(true);
    for (const action of actions) {
      expect(CardChatOutput.safeParse({ reply, actions: [action] }).success).toBe(true);
    }
  });

  it('rejects an action missing a field, an unknown kind and a bad lane', () => {
    const bad = [
      { kind: 'create_ticket', title: 'T' },
      { kind: 'steer_run', ticket_id: 'FG-1' },
      { kind: 'change_type', type: 'Not A Type' },
      { kind: 'suggest_close' },
      { kind: 'close_card', reason: 'x' },
      { kind: 'create_ticket', title: 'T', body: 'B', lane: 'warp' },
    ];

    for (const action of bad) {
      expect(CardChatOutput.safeParse({ reply, actions: [action] }).success).toBe(false);
    }
  });

  it('rejects an empty reply, a missing actions list and more than five actions', () => {
    const a = { kind: 'suggest_close', reason: 'x' };

    expect(CardChatOutput.safeParse({ reply: '', actions: [] }).success).toBe(false);
    expect(CardChatOutput.safeParse({ reply }).success).toBe(false);
    expect(CardChatOutput.safeParse({ reply, actions: Array(6).fill(a) }).success).toBe(
      false,
    );
  });
});

describe('chat card events', () => {
  it('parses director_message with and without actions_taken', () => {
    const base = { kind: 'director_message', at: T, actor: director };
    const taken = { action: 'create_ticket', result: 'done', summary: 'filed FG-2' };

    expect(NewCardEvent.safeParse({ ...base, payload: { text: 'hi' } }).success).toBe(
      true,
    );

    expect(
      NewCardEvent.safeParse({ ...base, payload: { text: 'hi', actions_taken: [taken] } })
        .success,
    ).toBe(true);

    expect(
      NewCardEvent.safeParse({
        ...base,
        payload: { text: 'hi', actions_taken: [{ ...taken, result: 'maybe' }] },
      }).success,
    ).toBe(false);
  });

  it('parses director_action and close_suggested and refuses an empty reason', () => {
    const action = { action: 'steer_run', result: 'done', summary: 'sent' };

    expect(
      NewCardEvent.safeParse({
        kind: 'director_action',
        at: T,
        actor: director,
        payload: action,
      }).success,
    ).toBe(true);

    expect(
      NewCardEvent.safeParse({
        kind: 'close_suggested',
        at: T,
        actor: director,
        payload: { reason: 'idle 14 days' },
      }).success,
    ).toBe(true);

    expect(
      NewCardEvent.safeParse({
        kind: 'close_suggested',
        at: T,
        actor: director,
        payload: { reason: '' },
      }).success,
    ).toBe(false);
  });
});

describe('CardDirectorStatus', () => {
  it('takes the three states and an optional last_error', () => {
    for (const state of ['idle', 'thinking', 'error']) {
      expect(CardDirectorStatus.safeParse({ state }).success).toBe(true);
    }

    expect(
      CardDirectorStatus.safeParse({ state: 'error', last_error: 'x' }).success,
    ).toBe(true);

    expect(CardDirectorStatus.safeParse({ state: 'busy' }).success).toBe(false);
  });
});

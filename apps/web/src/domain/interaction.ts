/**
 * Reading a pending question for display.
 *
 * Why: the server stores an interaction's `payload` as arbitrary JSON, but the person has to
 *   read one sentence and answer it. The run's `ask` event carries the prompt text; when the
 *   page joined late and never saw that event, the payload is the fallback. Anything else
 *   still gets a plain sentence, so a question is never shown blank.
 *
 * Exports: promptOf(), KIND_LABEL, quickReplies().
 * Depends on: @forge/core (InteractionKind type). No IO.
 */

import type { InteractionKind } from '@forge/core';

export const KIND_LABEL: Readonly<Record<InteractionKind, string>> = {
  question: 'Question',
  plan_confirm: 'Plan to confirm',
  permission: 'Permission request',
  blocked: 'Worker is stuck',
};

const FALLBACK = 'The Worker is waiting for your answer.';

/** The sentence to show: the streamed prompt, else a text field of the payload, else a generic line. */
export function promptOf(payload: unknown, streamed?: string): string {
  if (streamed !== undefined && streamed.trim() !== '') {
    return streamed;
  }

  if (typeof payload === 'string' && payload.trim() !== '') {
    return payload;
  }

  if (payload !== null && typeof payload === 'object') {
    for (const key of ['prompt', 'question', 'text', 'message']) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim() !== '') {
        return value;
      }
    }
  }

  return FALLBACK;
}

/** One-tap starting points for kinds that are usually yes or no; they fill the box, never send. */
export function quickReplies(kind: InteractionKind): readonly string[] {
  return kind === 'plan_confirm' || kind === 'permission'
    ? ['Yes, go ahead.', 'No, do not do that.']
    : [];
}

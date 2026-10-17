/**
 * Answer text — the words a Worker is given from a stored answer, whatever its age.
 *
 * Why: an answered interaction stores either a typed answer (`{ action: 'answer', by, text }`,
 *   written by the owner's act or the Director's first look) or, for rows from before
 *   escalations, the raw value the owner typed. The resume prompt must hand the Worker the same
 *   words in both cases: a typed record read as text would give the Worker JSON instead of an
 *   answer, and a raw value read as a record would give it nothing.
 *
 * Exports: answerText(), asAnswerRecord().
 * Depends on: @forge/core (EscalationAnswer). No IO.
 */

import { EscalationAnswer } from '@forge/core';

/** The answer in words: a typed answer's text, a raw string as it is, anything else as JSON; null when nothing was answered. */
export function answerText(answer: unknown): string | null {
  if (answer === undefined || answer === null) {
    return null;
  }

  const typed = EscalationAnswer.safeParse(answer);
  if (typed.success) {
    return typed.data.text ?? null;
  }

  return typeof answer === 'string' ? answer : JSON.stringify(answer);
}

/** A raw owner answer (from the legacy route or a chat reply) as the typed record the row stores now. */
export function asAnswerRecord(raw: unknown): EscalationAnswer {
  const typed = EscalationAnswer.safeParse(raw);
  if (typed.success) {
    return typed.data;
  }

  return {
    action: 'answer',
    by: 'owner',
    text: typeof raw === 'string' ? raw : JSON.stringify(raw),
  };
}

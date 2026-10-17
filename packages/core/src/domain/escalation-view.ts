/**
 * `toEscalation` — reads an interaction row as an escalation, whatever its age.
 *
 * Why: the owner's screens show Worker questions written before escalations existed (a free-form
 *   `{prompt}` payload), rows the Worker's own tools still write that way, and the typed rows
 *   Forge writes now. One pure reader turns all of them into the same shape, so a screen never
 *   branches on age and an odd or corrupt row degrades to a readable question instead of blanking
 *   the Inbox. The stage comes from `escalated_at`: until it is set the Director is still looking
 *   and the owner is not shown the row.
 *
 * Exports: toEscalation().
 * Depends on: schemas/escalation, schemas/interaction, types/escalation. No IO.
 */

import { EscalationAnswer, EscalationPayload } from '#/schemas/escalation.js';
import type { EscalationSettled } from '#/schemas/escalation.js';
import type { Interaction } from '#/schemas/interaction.js';
import type { EscalationBase } from '#/types/escalation.types.js';

const CLIP = 280;
const FALLBACK_TEXT = '(no question text was recorded)';

const clip = (text: string): string =>
  text.length > CLIP ? `${text.slice(0, CLIP - 1)}…` : text;

/** The question text of a payload of any age: the known text keys, a bare string, else the payload as JSON, clipped. */
function textOf(payload: unknown): string {
  if (typeof payload === 'string' && payload.trim() !== '') {
    return clip(payload.trim());
  }

  if (typeof payload === 'object' && payload !== null) {
    const o = payload as Record<string, unknown>;
    const text = [o['prompt'], o['question'], o['message'], o['reason'], o['text']].find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );

    if (text !== undefined) {
      return clip(text.trim());
    }
  }

  try {
    const json = JSON.stringify(payload);

    return json === undefined || json === '' ? FALLBACK_TEXT : clip(json);
  } catch {
    return FALLBACK_TEXT;
  }
}

/** Who and what settled a row that is no longer pending. */
function settledOf(row: Interaction): EscalationSettled | undefined {
  if (row.status === 'pending') {
    return undefined;
  }

  if (row.status === 'answered') {
    const typed = EscalationAnswer.safeParse(row.answer);
    const at = row.answered_at ?? row.asked_at;

    return typed.success
      ? { action: typed.data.action, by: typed.data.by, at }
      : { action: 'answer', by: 'owner', at };
  }

  // Timed out or cancelled by the system (a cancelled ticket): the owner did not choose it.
  return { action: 'cancel', by: 'auto', at: row.answered_at ?? row.timeout_at };
}

/** The row as an escalation; never throws. */
export function toEscalation(row: Interaction): EscalationBase {
  const typed = EscalationPayload.safeParse(row.payload);
  const payload: EscalationPayload = typed.success
    ? typed.data
    : {
        kind: 'question',
        text: textOf(row.payload),
        source: 'legacy',
        options: [],
      };

  const settled = settledOf(row);

  return {
    id: row.id,
    ticket_id: row.ticket_id as EscalationBase['ticket_id'],
    ...(row.card_id === undefined ? {} : { card_id: row.card_id }),
    kind: payload.kind,
    stage: row.escalated_at === undefined ? 'director' : 'owner',
    status: row.status,
    payload,
    asked_at: row.asked_at,
    ...(row.escalated_at === undefined ? {} : { escalated_at: row.escalated_at }),
    ...(settled === undefined ? {} : { settled }),
  };
}

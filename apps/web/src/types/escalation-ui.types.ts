/**
 * Shapes shared by the escalation card and its pieces.
 *
 * Why: the card owns one act call and hands the pieces (question form, action bar, dialogs) the
 *   same small control surface, so each piece can be tested and drawn alone while a click in any
 *   of them goes through the one mutation that settles every screen. Types only.
 *
 * Exports: EscalationControls, QuestionPayload, FailurePayload, SetupPayload,
 *   DecisionPayload, SignOffPayload, EscalationSnapshot.
 * Depends on: schemas/escalation (types).
 */

import type {
  EscalationAction,
  EscalationActBody,
  EscalationList,
  EscalationPayload,
} from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';

export interface EscalationControls {
  /** Sends the owner's choice; `onSuccess` runs once the server accepted it, `onFailure` if it refused. */
  readonly act: (
    body: EscalationActBody,
    onSuccess?: () => void,
    onFailure?: () => void,
  ) => void;
  /** The action in flight, so only its button spins and none can be clicked twice. */
  readonly pending: EscalationAction | null;
  /** The last refusal as the raw error (the pieces word it; the cancel dialog reads its details). */
  readonly error: unknown;
  /** Clears a shown refusal, for a dialog that is opened again. */
  readonly reset: () => void;
}

/** The five payload shapes, so each body component takes exactly its own. */
export type QuestionPayload = Extract<EscalationPayload, { kind: 'question' }>;
export type FailurePayload = Extract<EscalationPayload, { kind: 'failure' }>;
export type SetupPayload = Extract<EscalationPayload, { kind: 'setup' }>;
export type DecisionPayload = Extract<EscalationPayload, { kind: 'decision' }>;
export type SignOffPayload = Extract<EscalationPayload, { kind: 'sign_off' }>;

/** What an optimistic settle replaced, so a refusal can put it back. */
export interface EscalationSnapshot {
  readonly list: EscalationList | undefined;
  readonly ticket: TicketDetail | undefined;
}

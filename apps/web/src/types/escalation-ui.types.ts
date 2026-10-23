/**
 * Shapes shared by the escalation card and its pieces.
 *
 * Why: the card owns one act call and hands the pieces (question form, action bar, dialogs) the
 *   same small control surface, so each piece can be tested and drawn alone while a click in any
 *   of them goes through the one mutation that settles every screen. Types only.
 *
 * Exports: EscalationControls, QuestionPayload, FailurePayload, TurnLimit, TurnLimitHelp, ConflictDetail, ConflictReplan, SetupPayload, WorktreeSetupCause,
 *   DecisionPayload, SignOffPayload, PermissionPayload, PermissionTextPart, EscalationSnapshot.
 * Depends on: schemas/escalation (types).
 */

import type {
  EscalationAction,
  EscalationActBody,
  EscalationList,
  EscalationPayload,
  SetupCause,
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

/** The payload shapes, so each body component takes exactly its own. */
export type QuestionPayload = Extract<EscalationPayload, { kind: 'question' }>;
export type FailurePayload = Extract<EscalationPayload, { kind: 'failure' }>;
/** The limit a stopped run hit, as the server names it. */
export type TurnLimit = NonNullable<FailurePayload['limit']>;

/** The turn-limit sentence in parts: the owner's setting is bold and its screen is a link. */
export interface TurnLimitHelp {
  readonly lead: string;
  readonly setting: string;
  readonly mid: string;
  readonly linkText: string;
  readonly tail: string;
  readonly href: string;
}
/** The clash a merge-conflict failure carries: the files and who changed them first. */
export type ConflictDetail = NonNullable<FailurePayload['conflict']>;

/** What the Re-plan dialog of a merge-conflict stop says, and the note it starts with. */
export interface ConflictReplan {
  readonly title: string;
  readonly description: string;
  readonly comment: string;
}
export type SetupPayload = Extract<EscalationPayload, { kind: 'setup' }>;
/** The setup cause of a workspace whose install step failed (d-0180). */
export type WorktreeSetupCause = Extract<SetupCause, { type: 'worktree_setup' }>;
export type DecisionPayload = Extract<EscalationPayload, { kind: 'decision' }>;
export type SignOffPayload = Extract<EscalationPayload, { kind: 'sign_off' }>;
export type PermissionPayload = Extract<EscalationPayload, { kind: 'permission' }>;

/** One run of a command as shown: ordinary text, or a visible marker standing for a hidden character. */
export interface PermissionTextPart {
  readonly text: string;
  readonly hidden: boolean;
}

/** What an optimistic settle replaced, so a refusal can put it back. */
export interface EscalationSnapshot {
  readonly list: EscalationList | undefined;
  readonly ticket: TicketDetail | undefined;
}

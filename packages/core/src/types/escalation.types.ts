/**
 * Shapes the escalation rules pass around that are not API bodies.
 *
 * Why: the escalation view is what the screens read, but the core rules work one step earlier:
 *   an interaction row read into its typed form before the server adds the ticket's title and the
 *   actions on offer. The action rules also need to know a little about the ticket (whether it has
 *   a card a re-plan could go through) and the setup check needs the stored facts it compares.
 *   Naming those inputs keeps each rule file about its own rule.
 *
 * Exports: EscalationBase, ActionContext, WaitTicket, WaitClass, DenyDecision, SetupContext,
 *   SetupFacts, ParkClass.
 * Depends on: schemas/escalation, schemas/harness, schemas/harness-compat, schemas/ticket. Types only.
 */

import type {
  DecisionCause,
  EscalationView,
  FailureCause,
} from '#/schemas/escalation.js';
import type { HarnessKind, HarnessStatus } from '#/schemas/harness.js';
import type { CompatStatus, ToolSchemaStatus } from '#/schemas/harness-compat.js';
import type { TicketStatus } from '#/schemas/ticket.js';

/** An interaction row in its typed form: the view without what only the server knows (title, actions). */
export type EscalationBase = Omit<EscalationView, 'ticket_title' | 'actions'>;

/** What decides whether a re-plan is offered: the ticket has a card that is not a Discussion. */
export interface ActionContext {
  readonly replannable: boolean;
}

/** The ticket facts the wait actions read. */
export interface WaitTicket extends ActionContext {
  readonly status: TicketStatus;
}

/** How a ticket status can make the ticket wait: on the owner, on a review, on the scheduler, or not at all. */
export type WaitClass = 'owner' | 'review' | 'scheduler' | 'none';

/** One `admit()` decision of a run, as read from its receipt chain. */
export interface DenyDecision {
  readonly tool: string;
  readonly reason: string;
  readonly decision: 'allow' | 'deny' | 'ask';
  /** The harness build the tool schema was captured for, when the receipt recorded it. */
  readonly version: string | null;
}

/** The harness a failed run used; a setup cause names it. */
export interface SetupContext {
  readonly harness_id: string;
  readonly harness_kind: HarnessKind;
  readonly version: string;
}

/** The stored facts `isSetupFixed` compares; a missing fact means "not known to be fixed". */
export interface SetupFacts {
  readonly harness?: {
    readonly status: HarnessStatus;
    readonly last_checked_at?: string;
  } | null;
  readonly toolSchema?: { readonly status: ToolSchemaStatus } | null;
  /** The tool catalogue now lists the tool. */
  readonly catalogued?: boolean;
  /** The project's tool grant now lists the tool. */
  readonly granted?: boolean;
  readonly build?: { readonly compat: CompatStatus } | null;
}

/** What a parked ticket's reason text means: a failure, or a held ticket waiting for a decision. */
export type ParkClass =
  | { readonly kind: 'failure'; readonly cause: FailureCause; readonly summary: string }
  | {
      readonly kind: 'decision';
      readonly cause: DecisionCause;
      readonly summary: string;
    };

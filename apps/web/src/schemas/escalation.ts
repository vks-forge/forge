/**
 * Escalation schemas as the web reads them: all of them core's.
 *
 * Why: a ticket that cannot go on (a Worker's question, a failure, a missing login or tool) waits
 *   on the owner as one escalation, and the card chat, the Ticket page and the Inbox all draw that
 *   same item. The shapes, replies included, belong to `@forge/core`, so a cause or action added
 *   there reaches the UI with no edit here and a server and UI that disagree fail at the boundary
 *   with the field named. This file only re-exports them under the web's `#/schemas` path.
 *
 * Exports: EscalationKind, FAILURE_CAUSES, FailureCause, SetupCause, EscalationPayload,
 *   ESCALATION_ACTIONS, EscalationAction, EscalationView, EscalationActBody,
 *   EscalationList, EscalationActReply, TicketActReply (schemas and inferred types).
 * Depends on: @forge/core.
 */

export {
  ESCALATION_ACTIONS,
  EscalationAction,
  EscalationActBody,
  EscalationActReply,
  EscalationKind,
  EscalationList,
  EscalationPayload,
  EscalationView,
  FAILURE_CAUSES,
  FailureCause,
  SetupCause,
  TicketActReply,
} from '@forge/core';

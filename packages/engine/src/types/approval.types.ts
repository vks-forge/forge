/**
 * Types of the tool-approval door and of the answers a resumed Worker is told.
 *
 * Why: the hook handler (in `@forge/hooks`, which may not import the engine) asks the engine to
 *   park a call for the owner, and the engine answers with a closed set of outcomes, never a
 *   thrown string: a refused raise is a normal answer that makes the hook deny the call. The
 *   owner's answers come back to the Worker as plain records so the resume prompt and the
 *   brief can word them the same way (d-0175, execution-plane.md §6).
 *
 * Exports: ToolApprovalRequest, ToolApprovalResult, ApprovalAnswer.
 * Depends on: @forge/core (EscalationPermission). Types only.
 */

import type { EscalationPermission } from '@forge/core';

/** What the server tells the engine about a call that hit `ask`; everything is built from the tokenised call. */
export interface ToolApprovalRequest {
  readonly runId: string;
  readonly tool: string;
  /** The tool's action (`edit`, `shell`, ...). */
  readonly action: string;
  /** The exact command, URL or path, from the tokenised call. */
  readonly what: string;
  /** `approvalKey()` of the call. */
  readonly approvalKey: string;
  /** The `admit()` reason that asked. */
  readonly reasonCode: string;
  readonly always: EscalationPermission['always'];
  /** The harness's id of the call, for the run's event stream. */
  readonly callId?: string;
  /** The Worker's own description of the call (untrusted; used only as the "why", clipped). */
  readonly description?: unknown;
}

/** Why a raise was refused; the hook then denies the call (`approval_unavailable`). */
export type ToolApprovalRefusal =
  'run_not_live' | 'not_in_progress' | 'express' | 'too_many_pending' | 'closed';

export type ToolApprovalResult =
  | {
      readonly status: 'raised';
      readonly interactionId: string;
      readonly created: boolean;
    }
  | { readonly status: 'refused'; readonly reason: ToolApprovalRefusal };

/** One answered approval of a run, as the resumed Worker is told it. */
export interface ApprovalAnswer {
  readonly what: string;
  readonly answer: 'allow_once' | 'allow_always' | 'deny';
  readonly note?: string;
}

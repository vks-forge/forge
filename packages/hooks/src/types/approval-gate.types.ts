/**
 * Types for judging a call and resolving an `ask`.
 *
 * Why: the hook handler judges each call twice (as written and as it resolves on disk) and keeps
 *   the stricter verdict; an ask must be raised for the view that produced it, so the verdict
 *   travels with the context and call it was reached for. What an ask finally becomes (still an
 *   ask with the owner's approval id, or a denial) is a second small shape. Both sit here so the
 *   gate, the views and the handler agree (d-0175).
 *
 * Exports: JudgedCall, ResolvedAsk.
 * Depends on: @forge/tools (AdmitCall, AdmitContext, Decision). Types only.
 */

import type { AdmitCall, AdmitContext, Decision } from '@forge/tools';

/** A verdict with the context and call it was reached for. */
export interface JudgedCall {
  readonly decision: Decision;
  readonly ctx: AdmitContext;
  readonly call: AdmitCall;
}

/** The verdict to answer with and the approval it is tied to. */
export interface ResolvedAsk {
  readonly decision: Decision;
  /** The interaction the Worker waits on; set only for an `ask` that was raised. */
  readonly interactionId?: string;
}

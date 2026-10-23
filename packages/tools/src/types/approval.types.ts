/**
 * Types for owner approvals of tool calls.
 *
 * Why: when a Worker's call hits an `ask`, the owner answers once per call (allow once, always,
 *   deny). `admit()` must be told those answers as plain data, and the screen that offers
 *   "Always for this project" must be told what rule it would store, or why none is offered.
 *   Both shapes sit here so the server, the hook handler and `admit()` read the same words
 *   (tool-system.md §5.4, d-0175).
 *
 * Exports: ApprovalRef, ApprovalSet, AlwaysRule, AlwaysOffer.
 * Depends on: nothing. Types only.
 */

/** One answered approval: the call's key and the interaction that carries the answer. */
export interface ApprovalRef {
  /** `approvalKey()` of the call the owner saw. */
  readonly key: string;
  /** Interaction id, recorded as the matched rule (`approval:<ref>`). */
  readonly ref: string;
}

/** The owner's answers for a run: calls allowed once and calls denied. */
export interface ApprovalSet {
  readonly once: readonly ApprovalRef[];
  readonly denied: readonly ApprovalRef[];
}

/** The narrowest allow rule that would cover a call: stored under the project's `approved` list. */
export interface AlwaysRule {
  readonly action: string;
  readonly resource: string;
}

/** Whether "Always for this project" can be offered for an `ask`, and the rule it would store or why not. */
export type AlwaysOffer =
  | { readonly offered: true; readonly rule: AlwaysRule }
  | { readonly offered: false; readonly why: string };

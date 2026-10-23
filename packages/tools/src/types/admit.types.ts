/**
 * Types for the admission function's inputs.
 *
 * Why: `admit()` is the one door every tool listing and call passes through, including
 *   nested and code-mode calls. A single context and call shape means the list builder,
 *   the Claude hook, the Factory MCP server and future harness renderers all ask the
 *   same question in the same words, so "the list says yes, the call says no" cannot
 *   come from two code paths (tool-system.md §5.5).
 *
 * Exports: AdmitContext, AdmitCall, AdmitDraft, Inspector, InspectorResult, CallPhase, CallVia.
 * Depends on: @forge/core (Lane), types/approval, types/catalogue, types/grants, types/tokenizer, schemas/budget. No IO.
 */

import type { Lane } from '@forge/core';
import type { BudgetLimits, BudgetUsage } from '#/schemas/budget.js';
import type { DecisionLayer, ReasonCode } from '#/schemas/decision.js';
import type { Effect } from '#/schemas/grant.js';
import type { ApprovalSet } from '#/types/approval.types.js';
import type { CatalogueState } from '#/types/catalogue.types.js';
import type { EffectiveGrant } from '#/types/grants.types.js';

/** `list` builds the tool set shown to the model; `call` judges one invocation. */
export type CallPhase = 'list' | 'call';

/** How a call arrived: top level, from inside a meta-tool, or from a code-mode script. */
export type CallVia = 'direct' | 'nested' | 'codemode';

export interface AdmitContext {
  readonly lane: Lane;
  /** Harness id used to select `support[...]` (e.g. `claude-code`). */
  readonly harness: string;
  readonly catalogue: CatalogueState;
  readonly grant: EffectiveGrant;
  /** Schema hashes the harness reports for the live tools; a missing entry counts as a mismatch. */
  readonly liveSchemaHashes: Readonly<Record<string, string>>;
  /**
   * Native tools whose schema for the installed harness build is not approved: `pending`
   * (new build or changed schema, awaiting the owner) or `denied`. Absent means none.
   */
  readonly schemaStatus?: Readonly<Record<string, 'pending' | 'denied'>>;
  /** No human can answer an `ask`. Defaults to true on Express, false elsewhere. */
  readonly unattended?: boolean;
  /** Worker cwd, used to turn absolute paths into cwd-relative ones before rule matching. */
  readonly cwd?: string;
  readonly inspectors?: readonly Inspector[];
  /**
   * The owner's answers to earlier asks of this run (and the run it retries). Read only on
   * attended lanes; absent means none. They turn an `ask` into an allow or a deny, never a
   * deny into an allow (d-0175).
   */
  readonly approvals?: ApprovalSet;
  readonly budget?: { readonly limits: BudgetLimits; readonly usage: BudgetUsage };
}

export interface AdmitCall {
  readonly phase: CallPhase;
  /** Canonical catalogue id of the real tool, never a wrapper's name. */
  readonly tool: string;
  readonly via?: CallVia;
  /** The meta-tool the call came through; required when `via` is not `direct`. */
  readonly parent_tool?: string;
  /** The harness's own tool name; `PowerShell` selects the PowerShell tokenizer for `shell`. */
  readonly native?: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly estimated_usd?: number;
}

export interface InspectorResult {
  readonly effect: Effect;
  readonly finding_id?: string;
}

/** An inspector may only raise a decision; throwing is treated as `deny`. */
export type Inspector = (ctx: AdmitContext, call: AdmitCall) => InspectorResult;

/** A verdict being assembled inside `admit()`; layers may only raise it. */
export interface AdmitDraft {
  decision: Effect;
  reason: ReasonCode;
  layer: DecisionLayer;
  rule: string | null;
  findings: string[];
}

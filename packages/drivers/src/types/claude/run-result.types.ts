/**
 * Types for turning how a run ended into its final result.
 *
 * Why: the driver can overrule what the harness reported (it killed the run for a stall,
 *   or because a tool call had no receipt, or because the user cancelled), and the result
 *   table keys on that combined verdict. Naming the pieces keeps the pure result-building
 *   function and the supervisor that feeds it in agreement.
 *
 * Exports: Override, SettleInput, Effective.
 * Depends on: @forge/core (UsageReport), types/claude/engine. Types only.
 */

import type { UsageReport } from '@forge/core';
import type { EngineEnd, EngineEndKind } from '#/types/claude/engine.types.js';

/** A verdict the driver imposes on top of whatever the harness reported. */
export interface Override {
  readonly kind: 'stall' | 'turn_timeout' | 'policy_denied' | 'cancelled';
  readonly detail: string;
}

export interface SettleInput {
  readonly end: EngineEnd;
  readonly override: Override | null;
  readonly session: string | null;
  readonly usage: UsageReport;
  readonly costUsd: number | null;
  readonly filesTouched: readonly string[];
  /** Interaction id of an `ask_director` / `report_blocked` that is still the last thing the Worker did. */
  readonly pendingAsk: string | null;
}

export type Effective = EngineEndKind | Override['kind'];

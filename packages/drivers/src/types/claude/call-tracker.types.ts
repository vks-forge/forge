/**
 * Type of the tool-call tracker the supervisor uses for the receipt cross-check.
 *
 * Why: the supervisor and the tracker are separate files; the contract between them (feed
 *   events, ask what was rejected or never resolved) lives here so neither imports the other.
 *
 * Exports: CallTracker.
 * Depends on: @forge/core (RunEvent), types/claude/engine. Types only.
 */

import type { RunEvent } from '@forge/core';
import type { ToolCallRef } from '#/types/claude/engine.types.js';

export interface CallTracker {
  /** Feeds one run event; starts `check` for a call whose input is complete or that resolved. */
  onEvent(e: RunEvent): void;
  /** True when the harness rejected the call in validation, before the hook could run. */
  isRejected(callId: string): boolean;
  /** Calls announced without input that never resolved. */
  unresolved(): ToolCallRef[];
  clear(): void;
}

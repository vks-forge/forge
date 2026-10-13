/**
 * Types for what the event normalisers return.
 *
 * Why: both engines turn one raw protocol message into zero or more run events plus side
 *   signals the engine keeps (cost, rate-limit state, session id, the CLI result line).
 *   Returning them together keeps the normalisers pure, and naming the shapes lets the
 *   engines and their tests agree on them.
 *
 * Exports: AcpNormalised, CliNormalised.
 * Depends on: schemas/claude-acp, schemas/claude-stream-json, types/claude/engine.
 *   Types only.
 */

import type { RateLimitInfo } from '#/schemas/claude-acp.js';
import type { CliResultLine } from '#/schemas/claude-stream-json.js';
import type { EventDraft } from '#/types/claude/engine.types.js';

export interface AcpNormalised {
  readonly events: readonly EventDraft[];
  /** Cumulative session cost in USD from a usage update, when reported. */
  readonly costUsd?: number;
  readonly rateLimit?: RateLimitInfo;
  /** `sessionUpdate` kind that was ignored, for the debug log. */
  readonly dropped?: string;
}

export interface CliNormalised {
  readonly events: readonly EventDraft[];
  readonly session?: string;
  readonly rateLimit?: RateLimitInfo;
  readonly result?: CliResultLine;
}

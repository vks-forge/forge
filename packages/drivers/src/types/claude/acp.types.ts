/**
 * Types private to the ACP engine run.
 *
 * Why: the engine waits for the adapter to push a login report before it opens a session;
 *   the three states of that wait (nothing yet, a subscription account, no login) decide
 *   whether the run proceeds or ends as an auth failure.
 *
 * Exports: AuthState, AdapterProcess, AcpAgent, AcpRunState.
 * Depends on: @agentclientprotocol/sdk, schemas/claude-acp, types/claude/driver-deps,
 *   types/claude/engine. Types only.
 */

import type { client } from '@agentclientprotocol/sdk';
import type { RateLimitInfo } from '#/schemas/claude-acp.js';
import type { ChildLike } from '#/types/claude/driver-deps.types.js';
import type { EngineEnd } from '#/types/claude/engine.types.js';

export type AuthState = 'unknown' | 'account' | 'none';

/** A started adapter process with its exit watcher and idempotent tree kill. */
export interface AdapterProcess {
  readonly child: ChildLike;
  /** Resolves as a crash end when the process exits or fails to start. */
  readonly exitedEnd: Promise<EngineEnd>;
  kill(): Promise<void>;
  hasExited(): boolean;
}

/** The agent side of a connected ACP client: where requests and notifications go out. */
export type AcpAgent = ReturnType<ReturnType<typeof client>['connect']>['agent'];

/** Mutable facts about one ACP run, shared by the session setup, turn loop and steering. */
export interface AcpRunState {
  rateLimit: RateLimitInfo | null;
  sessionId: string | null;
  /** The adapter advertised `_session/steering` during `initialize`. */
  steering: boolean;
  /** Session updates are only forwarded once the session is open. */
  accepting: boolean;
  closed: boolean;
  /** An interrupt is in flight; the resulting `cancelled` turn end is not the run's end. */
  interrupting: boolean;
}

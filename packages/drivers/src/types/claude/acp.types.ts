/**
 * Types private to the ACP engine run.
 *
 * Why: the engine waits for the adapter to push a login report before it opens a session;
 *   the three states of that wait (nothing yet, a subscription account, no login) decide
 *   whether the run proceeds or ends as an auth failure.
 *
 * Exports: AuthState, AdapterProcess.
 * Depends on: types/claude/driver-deps, types/claude/engine. Types only.
 */

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

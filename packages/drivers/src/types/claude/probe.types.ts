/**
 * Types for the tool-less probe call.
 *
 * Why: testing an agent is one short model call with its instructions and nothing else: no
 *   tools, no session on disk, no MCP, no project settings. It needs only the means to start
 *   a process, a clock for the deadline and the harness resolver, so it takes exactly those
 *   instead of the whole driver deps.
 *
 * Exports: ProbeDeps.
 * Depends on: types/claude/{driver-deps,harness}. Types only.
 */

import type { Clock, SpawnFn } from '#/types/claude/driver-deps.types.js';
import type { HarnessResolver } from '#/types/claude/harness.types.js';

export interface ProbeDeps {
  readonly spawn: SpawnFn;
  readonly clock: Clock;
  readonly resolver: HarnessResolver;
  /** The allowlisted host environment; the harness credential is added per call. */
  readonly baseEnv: Readonly<Record<string, string>>;
  /** Added to a quota or rate-limit answer that names no reset time. */
  readonly backoffMs?: number;
}

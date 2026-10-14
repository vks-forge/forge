/**
 * Types for what the Claude DirectorLLM adapter is handed by the app.
 *
 * Why: the Director's model calls run `claude -p` as a short-lived child. The adapter must
 *   not reach into the real OS in a test (processes, time, env), so the app injects the
 *   spawner and clock, and the few values only the app knows: the working directory the
 *   child starts in and the host env that carries the user's login. Everything else has a
 *   default that is safe for a Director step (no tools, no settings, a two minute ceiling).
 *
 * Exports: ClaudeDirectorLLMDeps.
 * Depends on: types/claude/driver-deps. Types only.
 */

import type {
  Clock,
  EnvLike,
  Logger,
  SpawnFn,
} from '#/types/claude/driver-deps.types.js';

export interface ClaudeDirectorLLMDeps {
  readonly spawn: SpawnFn;
  readonly clock: Clock;
  /** Executable to run; default `claude`. On Windows it must be a real executable, not a `.cmd` shim. */
  readonly claudeBinary?: string;
  /** Host env the child inherits (login, PATH); default empty, so the app passes `process.env`. */
  readonly baseEnv?: EnvLike;
  /** Extra host variable names the child may inherit beyond the allowlist; default none. */
  readonly envPassthrough?: readonly string[];
  readonly platform?: NodeJS.Platform;
  /**
   * Directory the child starts in. A step reads no files, but `claude` still looks for project
   * settings upward from here, so the app should pass an empty temp dir. Undefined inherits
   * the Forge process's directory.
   */
  readonly cwd?: string;
  /** Hard ceiling for one call before the child is killed and the step ends as a stall; default 120000. */
  readonly timeoutMs?: number;
  /** Wait applied to a rate limit that names no reset time; default 60000. */
  readonly rateLimitBackoffMs?: number;
  /** Signals a POSIX process group on kill; defaults to `process.kill(-pid, signal)`. */
  readonly signalGroup?: (pid: number, signal: NodeJS.Signals) => void;
  readonly log?: Logger;
}

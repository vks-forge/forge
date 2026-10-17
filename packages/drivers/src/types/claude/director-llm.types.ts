/**
 * Types for what the Claude DirectorLLM adapter is handed by the app.
 *
 * Why: the Director's model calls run `claude -p` as a short-lived child. The adapter must
 *   not reach into the real OS in a test (processes, time, env), so the app injects the
 *   spawner and clock, and the few values only the app knows: the working directory the
 *   child starts in and the host env that carries the user's login. Everything else has a
 *   default that is safe for a Director step (no tools, no settings, a two minute ceiling).
 *
 * Exports: ClaudeDirectorLLMDeps, DirectorStepTrace.
 * Depends on: types/claude/driver-deps. Types only.
 */

import type { SecretStore } from '@forge/core';
import type {
  Clock,
  EnvLike,
  Logger,
  SpawnFn,
} from '#/types/claude/driver-deps.types.js';
import type { HarnessSource } from '#/types/claude/harness.types.js';

/** What one finished step child said and was told, as plain text, for the debug trace (d-0163). */
export interface DirectorStepTrace {
  readonly step: string;
  /** The exact text sent on stdin. */
  readonly prompt: string;
  /** Everything the child printed to stdout (the result document, or what came before a kill). */
  readonly raw: string;
  /** How the child ended, e.g. `code 0, signal null` or `killed`. */
  readonly exit: string;
  /** The tail of stderr plus stdout, as kept for diagnostics. */
  readonly tail: string;
}

export interface ClaudeDirectorLLMDeps {
  readonly spawn: SpawnFn;
  readonly clock: Clock;
  /** Executable name or path used when the harness registry gives no override; default `claude`, found on PATH. On Windows it must be a real executable, not a `.cmd` shim. */
  readonly claudeBinary?: string;
  /** The owner's harness settings (override path, auth mode), read per step; default `claude` with its own login. */
  readonly harness?: HarnessSource;
  /** Where API keys and OAuth tokens are read from; required for those auth modes. */
  readonly secrets?: SecretStore;
  /** File-existence check used to find `claude`; defaults to `fs.existsSync`. */
  readonly fileExists?: (path: string) => boolean;
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
  /** Called once per step whose child ran, with the prompt and raw output; a throwing callback is ignored. Absent means nothing is captured. */
  readonly onTrace?: (trace: DirectorStepTrace) => void;
}

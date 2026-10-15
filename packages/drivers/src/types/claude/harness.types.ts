/**
 * Types for resolving the installed harness and its credentials at the start of a run.
 *
 * Why: which `claude` runs a Worker and how it authenticates are owner settings that can
 *   change between two runs (a new install path, a pasted API key). The driver therefore
 *   asks for them per run instead of capturing them at start-up, through ports the app
 *   fills from the harness registry and the SecretStore. Keeping the secret inside
 *   `ResolvedHarness.authEnv`, and nowhere else, gives one object to protect from logs.
 *
 * Exports: HarnessSetup, HarnessSource, ResolvedBinary, ResolvedHarness, HarnessResolver,
 *   HarnessResolverDeps, AuthVerdict, CaptureOptions, HarnessTestDeps, HarnessTestResult.
 * Depends on: @forge/core (HarnessAuthMode, SecretStore), types/claude/driver-deps. Types only.
 */

import type { HarnessAuthMode, SecretStore } from '@forge/core';
import type { Clock, EnvLike, SpawnFn } from '#/types/claude/driver-deps.types.js';

/** The owner's settings for one harness, as the registry holds them. */
export interface HarnessSetup {
  readonly id: string;
  /** Absolute executable path; undefined means "find `claude` on PATH". */
  readonly binaryPath?: string | undefined;
  readonly authMode: HarnessAuthMode;
  /** Set when the harness is paused (its build failed the compatibility check): why, in plain words. */
  readonly pausedReason?: string | undefined;
}

/** Reads the current settings; called at the start of every run and preflight. */
export type HarnessSource = () => Promise<HarnessSetup> | HarnessSetup;

/** The installed executable, with no credential read. */
export interface ResolvedBinary {
  readonly id: string;
  readonly binaryPath: string;
  readonly authMode: HarnessAuthMode;
}

/** The executable plus the credential environment for exactly one run. Never log it. */
export interface ResolvedHarness extends ResolvedBinary {
  /** At most one of `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`; empty for `login`. */
  readonly authEnv: Readonly<Record<string, string>>;
}

export interface HarnessResolver {
  /** Finds the executable only (preflight, version probe, Settings test). */
  binary(): Promise<ResolvedBinary>;
  /** Finds the executable and reads the credential the auth mode needs from the SecretStore. */
  forRun(): Promise<ResolvedHarness>;
}

export interface HarnessResolverDeps {
  readonly platform: NodeJS.Platform;
  /** Host env, only to read PATH; credentials are never taken from it. */
  readonly env: EnvLike;
  readonly exists: (path: string) => boolean;
  /** Name or path used when the registry has no override (`claude`). */
  readonly defaultBinary: string;
  readonly source?: HarnessSource | undefined;
  readonly secrets?: SecretStore | undefined;
}

/** `accept`: start the session; `reject`: the harness is not logged in; `ignore`: keep waiting for a better report. */
export type AuthVerdict = 'accept' | 'reject' | 'ignore';

export interface CaptureOptions {
  /** Written to the child's stdin before it is closed; default nothing. */
  readonly stdin?: string;
  readonly timeoutMs: number;
}

export interface HarnessTestDeps {
  readonly spawn: SpawnFn;
  readonly clock: Clock;
  readonly source: HarnessSource;
  readonly secrets?: SecretStore | undefined;
  readonly baseEnv: EnvLike;
  readonly envPassthrough?: readonly string[] | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  readonly defaultBinary?: string | undefined;
  readonly fileExists?: ((path: string) => boolean) | undefined;
}

/** What `POST /harnesses/:id/test` answers. `live` says whether the paid call ran. */
export interface HarnessTestResult {
  readonly binary_path?: string;
  readonly version?: string;
  readonly auth_mode: string;
  readonly ok: boolean;
  /** `account`, `api_key`, `oauth_token` or `none` as `claude auth status` reports it. */
  readonly account_kind?: string;
  readonly live: 'skipped' | 'ok' | 'failed';
  readonly error?: string;
}

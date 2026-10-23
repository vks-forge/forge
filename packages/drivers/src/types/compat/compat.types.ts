/**
 * Types for the harness compatibility check.
 *
 * Why: the check drives a real harness build against a scripted model and must turn what it
 *   saw into a pass or a fail. Keeping the raw observations (`CompatTrace`) apart from the
 *   judgement over them lets the judging functions be tested on hand-made traces, including
 *   the broken ones no healthy build produces (a hook that never ran, a result before its
 *   announcement), which is exactly what the check exists to catch.
 *
 * Exports: CapturedTool, HookObservation, CompatTrace, ScriptedCall, CompatDeps, CompatJobState,
 *   NativeToolNames, CarriedShape, ShapeDiff, KnownGoodBuild, SessionScript, SseEvent,
 *   InstalledCompatDeps,
 *   MessagesBody, FakeModelApi, HookServer.
 * Depends on: @forge/core (RunEvent, HarnessKind, CompatReport), types/claude/{driver-deps,
 *   harness}. Types only.
 */

import type {
  CompatReport,
  CompatToolShape,
  HarnessKind,
  HarnessToolSchema,
  RunEvent,
} from '@forge/core';
import type { Clock, EnvLike, SpawnFn } from '#/types/claude/driver-deps.types.js';
import type { HarnessSource } from '#/types/claude/harness.types.js';

/** Catalogue tool id to the harness's own names for it (`shell` to `Bash`, `PowerShell`). */
export type NativeToolNames = Readonly<Record<string, readonly string[]>>;

/** One tool exactly as the harness sent it to the model API. */
export interface CapturedTool {
  readonly name: string;
  readonly input_schema: unknown;
}

/** One hook post the check's own hook server received, in arrival order. */
export interface HookObservation {
  readonly event: string;
  readonly toolUseId?: string;
  readonly toolName?: string;
}

/** Everything the scripted session showed; the judging functions read only this. */
export interface CompatTrace {
  readonly engine: 'acp' | 'cli';
  /** Version the harness reported to the model API (user agent), null if never seen. */
  readonly runVersion: string | null;
  readonly installedVersion: string;
  /** Tools of the first model request that offered tools, in the order sent. */
  readonly captured: readonly CapturedTool[];
  readonly hooks: readonly HookObservation[];
  readonly events: readonly RunEvent[];
  /** Whether the denied call's file exists afterwards (it must not). */
  readonly deniedFileExists: boolean;
  /** Whether an allowed write produced its file. */
  readonly allowedFileExists: boolean;
  /** Set when the run itself could not be driven (the harness failed to start, timed out). */
  readonly runError: string | null;
}

/** A tool call the fake model asks the harness to make. */
export interface ScriptedCall {
  /** Harness tool names to try in order; the first one the harness offers is used. */
  readonly names: readonly string[];
  readonly input: Readonly<Record<string, unknown>>;
}

export interface CompatDeps {
  readonly kind: HarnessKind;
  readonly engine: 'acp' | 'cli';
  /** Absolute path of the installed executable under test. */
  readonly binaryPath: string;
  /** Version the installed executable reported (`--version`). */
  readonly version: string;
  readonly nativeTools: NativeToolNames;
  readonly clock: Clock;
  readonly spawn: SpawnFn;
  readonly baseEnv?: EnvLike | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  /** Where the throwaway working folders go; default the OS temp folder. */
  readonly tempRoot?: string | undefined;
  /** Wall-clock limit for the scripted session. */
  readonly timeoutMs?: number | undefined;
  readonly now?: (() => Date) | undefined;
}

/** State of the background compatibility job for one harness, as the API reports it. */
export interface CompatJobState {
  readonly state: 'idle' | 'running' | 'done' | 'failed';
  readonly version?: string;
  readonly started_at?: string;
  readonly finished_at?: string;
  readonly error?: string;
  readonly report?: CompatReport;
}

/** A tool whose shape matches a decided row of an earlier build: the decision moves to this build. */
export interface CarriedShape {
  readonly shape: CompatToolShape;
  /** The earlier build's `approved` or `denied` row the decision is copied from. */
  readonly from: HarnessToolSchema;
}

/** What to write to `harness_tool_schemas` after a check. */
export interface ShapeDiff {
  /** Shape unchanged and already decided: keep the row as it is. */
  readonly keep: readonly string[];
  /** New, changed or previously undecided: store as pending with the new hash. */
  readonly pending: readonly CompatToolShape[];
  /** Same shape as an earlier build's decided row: store with that decision, marked as carried. */
  readonly carried: readonly CarriedShape[];
}

/** A build whose tools shipped as verified with this release: its check is skipped (d-0088). */
export interface KnownGoodBuild {
  readonly version: string;
  /** Catalogue tool id to the schema hash captured when the build was verified. */
  readonly tools: Readonly<Record<string, string>>;
}

/** The calls of the compatibility session and the two files that prove what ran. */
export interface SessionScript {
  readonly calls: (offered: ReadonlySet<string>) => readonly ScriptedCall[];
  /** Created by an allowed write; must exist after the session. */
  readonly allowedFile: string;
  /** Targeted by the write the hook denies; must not exist after the session. */
  readonly deniedFile: string;
}

/** One server-sent event of the model API stream the fake model plays. */
export interface SseEvent {
  readonly type: string;
  readonly [field: string]: unknown;
}

/** What the compatibility check needs to find and drive the installed harness. */
export interface InstalledCompatDeps {
  readonly source: HarnessSource;
  readonly spawn: SpawnFn;
  readonly clock: Clock;
  readonly engine: 'acp' | 'cli';
  readonly baseEnv: EnvLike;
  readonly envPassthrough?: readonly string[] | undefined;
  readonly defaultBinary?: string | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  readonly fileExists?: ((path: string) => boolean) | undefined;
}

/** The parts of a model API request the fake reads. */
export interface MessagesBody {
  tools?: { name?: unknown; input_schema?: unknown }[];
  messages?: unknown;
}

export interface FakeModelApi {
  readonly baseUrl: string;
  /** Tools of the first request that offered any. */
  captured(): readonly CapturedTool[];
  /** Build version from the user agent of the main request, null before one arrives. */
  version(): string | null;
  close(): Promise<void>;
}

/** The check's own hook route: records every post and which calls it denied. */
export interface HookServer {
  readonly url: string;
  readonly seen: HookObservation[];
  /** Ids of the tool calls the hook answered `deny` to. */
  readonly denied: Set<string>;
  close(): Promise<void>;
}

/**
 * Types for the seam between the Claude driver and its two engines.
 *
 * Why: the driver owns what must hold whichever engine hosts the harness: the event log,
 *   the stall and turn timers, the receipt cross-check, the final result. An engine owns
 *   only how to talk to one kind of process (ACP over JSON-RPC, or stream-json from
 *   `claude -p`). A narrow seam, where the engine pushes events and a terminal outcome into
 *   a sink and exposes steer and cancel, is what lets the same rules and the same result
 *   table apply to both engines, and lets a third engine be added without touching them.
 *
 * Exports: EventDraft, EngineEndKind, EngineEnd, ToolCallRef, EngineSink, RunFiles,
 *   EngineLaunch, EngineHandle, ClaudeEngine, EngineDeps.
 * Depends on: @forge/core (RunEvent, RunRequest, ...), @forge/tools (Decision),
 *   types/claude/{driver-deps,harness}. Types only.
 */

import type {
  DriverCapabilities,
  HarnessAuthMode,
  Preflight,
  RunEvent,
  RunRequest,
  SteerMode,
  UsageReport,
} from '@forge/core';
import type { Decision } from '@forge/tools';
import type { ClaudeDriverConfig } from '#/schemas/claude-config.js';
import type { HarnessResolver } from '#/types/claude/harness.types.js';
import type {
  Clock,
  Logger,
  PreparedRun,
  SpawnFn,
} from '#/types/claude/driver-deps.types.js';

type WithoutSeqTs<T> = T extends unknown ? Omit<T, 'seq' | 'ts'> : never;

/** A run event before the driver numbers and timestamps it. */
export type EventDraft = WithoutSeqTs<RunEvent>;

/** How the harness side ended, before the driver applies its own overrides (stall, cross-check). */
export type EngineEndKind =
  | 'completed'
  | 'refused'
  | 'max_turns'
  | 'budget'
  | 'rate_limit'
  | 'quota'
  | 'model_unavailable'
  | 'auth'
  | 'cancelled'
  | 'policy_denied'
  | 'crash'
  | 'unknown';

export interface EngineEnd {
  readonly kind: EngineEndKind;
  readonly detail?: string;
  /** ISO time before which a `rate_limit` end must not be retried; for `quota`, the reset the harness named (absent when it named none). */
  readonly retryNotBefore?: string;
}

/** A tool call as the harness stream described it. */
export interface ToolCallRef {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/** What an engine may do to the run it hosts. */
export interface EngineSink {
  /** Appends an event; any event also counts as activity for the stall timer. */
  emit(draft: EventDraft): void;
  /** Counts as activity without emitting (a heartbeat the log should not carry). */
  activity(): void;
  setSession(ref: string): void;
  setUsage(usage: UsageReport): void;
  setCostUsd(costUsd: number): void;
  /** A turn (one prompt to the harness) started; arms the per-turn timeout. */
  turnStarted(): void;
  turnEnded(): void;
  /** The decision the hook recorded for this call; waits up to the receipt grace window. */
  decisionFor(call: ToolCallRef): Promise<Decision | null>;
  /** Records a policy breach from inside the engine (for example a failed `set_mode`) and cancels the run. */
  abort(kind: 'policy_denied', detail: string): void;
}

/** Paths of the per-run files the driver wrote for the engine. */
export interface RunFiles {
  readonly settingsPath: string;
  readonly hookConfigPath: string;
  /** Only the CLI engine reads this; the ACP engine passes servers inline. */
  readonly mcpConfigPath: string;
}

export interface EngineLaunch {
  readonly req: RunRequest;
  readonly prepared: PreparedRun;
  readonly files: RunFiles;
  /** Child env: host + request + prepared, nesting variables removed, plus this run's credential variable. */
  readonly env: Readonly<Record<string, string>>;
  /** The user's installed `claude`, resolved for this run (absolute path). */
  readonly claudeBinary: string;
  /** How the harness authenticates; the ACP engine accepts only the matching account report. */
  readonly authMode: HarnessAuthMode;
  readonly prompt: string;
  readonly resumeSession: string | undefined;
}

export interface EngineHandle {
  readonly ended: Promise<EngineEnd>;
  steer(message: string, mode: SteerMode): Promise<void>;
  /** Graceful cancel, then a forced kill of the process tree after the grace period. */
  cancel(): Promise<void>;
}

export interface ClaudeEngine {
  readonly kind: 'acp' | 'cli';
  capabilities(): DriverCapabilities;
  preflight(): Promise<Preflight>;
  launch(launch: EngineLaunch, sink: EngineSink): EngineHandle;
}

/** What an engine factory is given. */
export interface EngineDeps {
  readonly config: ClaudeDriverConfig;
  readonly clock: Clock;
  readonly spawn: SpawnFn;
  readonly platform: NodeJS.Platform;
  readonly signalGroup?: ((pid: number, signal: NodeJS.Signals) => void) | undefined;
  readonly log: Logger;
  /** Host env the harness inherits; used to run version probes the way a run would. */
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  readonly acpEntry?: string | undefined;
  /** Finds the installed `claude` (preflight and version probes). */
  readonly resolver: HarnessResolver;
}

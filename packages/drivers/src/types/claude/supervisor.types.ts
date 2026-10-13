/**
 * Types for the run supervisor: what it is given and the handle it returns.
 *
 * Why: the supervisor is the one place that owns a run after launch (events, timers,
 *   receipt cross-check, result). Its input is everything the driver composed (request,
 *   config, ports, a launch function for the engine) and its output is the narrow handle
 *   the driver stores per run, so the driver never touches supervisor internals.
 *
 * Exports: SuperviseArgs, SupervisedRun.
 * Depends on: @forge/core, schemas/claude-config, shared/event-log, types/claude/*.
 *   Types only.
 */

import type { RunEvent, RunRequest, RunResult, SteerMode } from '@forge/core';
import type { ClaudeDriverConfig } from '#/schemas/claude-config.js';
import type { EventLog } from '#/shared/event-log.js';
import type {
  Clock,
  GitPort,
  Logger,
  ReceiptLookup,
} from '#/types/claude/driver-deps.types.js';
import type { EngineHandle, EngineSink } from '#/types/claude/engine.types.js';

export interface SuperviseArgs {
  readonly req: RunRequest;
  readonly config: ClaudeDriverConfig;
  readonly clock: Clock;
  readonly receipts: ReceiptLookup;
  readonly git: GitPort;
  readonly log: Logger;
  /** Commit the worktree was at when the run began; null when git could not say. */
  readonly base: string | null;
  readonly startSession: string | null;
  /** Starts the engine; called once, synchronously, with the sink it reports into. */
  readonly launch: (sink: EngineSink) => EngineHandle;
}

export interface SupervisedRun {
  readonly events: EventLog<RunEvent>;
  readonly result: Promise<RunResult>;
  readonly req: RunRequest;
  session(): string | null;
  isSettled(): boolean;
  steer(message: string, mode: SteerMode, inboxSeq?: number): Promise<void>;
  cancel(): Promise<void>;
}

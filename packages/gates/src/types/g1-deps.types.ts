/**
 * Dependency and seam types for the G1 gate.
 *
 * Why: G1 judges a Worker from evidence the Worker cannot forge (the receipt chain, the
 *   git diff, a re-run of the project's own commands). Every source of that evidence and
 *   every side effect (spawning a process, the clock, the environment, the per-run
 *   secrets kept in the SecretStore for the life of the run, d-0100) is injected, so the gate is tested with
 *   in-memory fakes and the server decides where the real ones come from.
 *
 * Exports: ToolCallRef, CommandRequest, CommandResult, RunCommand, G1Deps, G1CoreDeps.
 * Depends on: @forge/core (WorktreeManager), @forge/tools (ReceiptLog, HmacKey). Types only.
 */

import type { Run, WorktreeManager } from '@forge/core';
import type { HmacKey, ReceiptLog } from '@forge/tools';

/** A tool call the harness reported for a run; `callId` is the harness's tool-use id. */
export interface ToolCallRef {
  readonly callId: string;
  readonly name: string;
}

export interface CommandRequest {
  readonly command: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

/** `output` is stdout and stderr interleaved; the runner may already have trimmed it. */
export interface CommandResult {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly output: string;
}

/** Runs one shell command; rejects only when the process could not be started. */
export type RunCommand = (req: CommandRequest) => Promise<CommandResult>;

export interface G1Deps {
  readonly receipts: ReceiptLog;
  readonly worktrees: Pick<WorktreeManager, 'diff'>;
  /** The run's tool-call events, in order. */
  readonly listToolCalls: (runId: string) => Promise<readonly ToolCallRef[]>;
  /**
   * Ids of the ticket's earlier runs (rework and resume chain, oldest first). Once their own
   * chains verify under their own secrets, their receipts cover the files they edited (the
   * rework branch holds those edits) and back `edited` and `read` claims; ran_tests and
   * added_test need the run's own evidence, and the chain that gates the verdict stays the run's.
   */
  readonly earlierRunIds?: (run: Run) => Promise<readonly string[]>;
  /**
   * The receipt secret of one generation of a run (1, plus one per resume after a restart),
   * or null when it is gone. G1 asks for every generation the run reached and fails when any
   * is missing (d-0100).
   */
  readonly runSecrets: (runId: string, generation: number) => Promise<HmacKey | null>;
  /** Parent environment; only an allowlist of it reaches project commands (shared/env). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Extra variable names to pass from `env` to project commands (default: none). */
  readonly passEnv?: readonly string[];
  /** Defaults to the real spawner. */
  readonly runCommand?: RunCommand;
  /** Per-command timeout, default 10 minutes. */
  readonly commandTimeoutMs?: number;
  /** Tool calls that legitimately have no decision receipt (default: none). */
  readonly ignoreToolCall?: (call: ToolCallRef) => boolean;
  readonly now?: () => Date;
}

/** What the domain gate needs: `G1Deps` with the command runner supplied by the caller. */
export type G1CoreDeps = Omit<G1Deps, 'runCommand'> & { readonly runCommand: RunCommand };

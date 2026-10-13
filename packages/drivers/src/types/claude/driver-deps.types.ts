/**
 * Types for what the Claude driver is handed by the app: ports, clock, spawn, git.
 *
 * Why: the driver sits inside the adapter ring and may import only core and tools, yet a
 *   run needs things only the app owns: the run directory and run token, a read view of
 *   the server-side receipt chain, the Forge MCP server entry, the clock and the means to
 *   start processes. Each is an injected port so the driver never reaches into the
 *   database, the HTTP server or the real OS in a test, and so "who decides a tool call"
 *   stays one door: the driver only reads the verdict the hook already recorded
 *   (d-0052, claude-driver brief "One door").
 *
 * Exports: EnvLike, McpServerSpec, PreparedRun, ToolCallMatch, ReceiptLookup, Clock, ChildLike,
 *   SpawnOptions, SpawnFn, KillTreeOptions, GitPort, LogLevel, Logger, ClaudeDriverDeps.
 * Depends on: @forge/core (RunRequest), @forge/tools (Decision), schemas/claude-config,
 *   types/claude/engine. Types only.
 */

import type { Readable, Writable } from 'node:stream';
import type { RunRequest } from '@forge/core';
import type { Decision } from '@forge/tools';
import type { ClaudeDriverConfig } from '#/schemas/claude-config.js';
import type { ClaudeEngine, EngineDeps } from '#/types/claude/engine.types.js';

/** A process environment where unset values are allowed (as in `process.env`). */
export type EnvLike = Readonly<Record<string, string | undefined>>;

/** A stdio MCP server the Worker may use (the Forge MCP server for this run). */
export interface McpServerSpec {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/** What the app prepared for one run before the driver starts anything. */
export interface PreparedRun {
  /** `.forge/data/runs/<id>/`, created by the app; the driver writes its settings files here. */
  readonly runDir: string;
  readonly mcpServers: readonly McpServerSpec[];
  /** Extra env for the harness process (FORGE_* variables, never credentials). */
  readonly env: Readonly<Record<string, string>>;
  /** Base URL the hook posts to (`POST <url>/runs/<run_id>/hook`). */
  readonly hookServerUrl: string;
  /** Bearer token the hook presents; the server holds only its hash. */
  readonly hookToken: string;
}

/** What the driver saw of a tool call, for joining when the harness and hook ids differ. */
export interface ToolCallMatch {
  /** Harness-native tool name as the stream reported it. */
  readonly name: string;
  /** SHA-256 of the canonical JSON of the tool input (same digest the receipt stores). */
  readonly argsHash: string;
}

/** Read access to the server-side receipt chain. */
export interface ReceiptLookup {
  /** The decision recorded for this tool call, or null when no receipt exists (yet). */
  decisionFor(
    runId: string,
    toolUseId: string,
    match?: ToolCallMatch,
  ): Promise<Decision | null>;
}

/** Time source with cancellable timers, so tests control stalls and grace windows. */
export interface Clock {
  now(): number;
  /** Runs `fn` after `ms`; the returned function cancels it. */
  after(ms: number, fn: () => void): () => void;
}

/** The part of a child process the driver uses. */
export interface ChildLike {
  readonly pid?: number | undefined;
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  kill(signal?: NodeJS.Signals): boolean;
  on(
    event: 'exit',
    listener: (code: number | null, signal: string | null) => void,
  ): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export interface SpawnOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Start in its own process group (POSIX) so the whole tree can be signalled. */
  readonly detached?: boolean;
}

/** Starts a process with piped stdio; never through a shell. */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildLike;

/** Git facts about the worktree a run edited. */
export interface GitPort {
  /** Commit the worktree is at; the base `changedFiles` compares against. */
  head(cwd: string): Promise<string>;
  /** Paths changed since `base`, including uncommitted and untracked files. */
  changedFiles(cwd: string, base: string): Promise<string[]>;
}

export type LogLevel = 'debug' | 'info' | 'warn';
export type Logger = (
  level: LogLevel,
  message: string,
  fields?: Readonly<Record<string, unknown>>,
) => void;

export interface ClaudeDriverDeps {
  /** Engine choice and time windows; missing fields take their defaults. */
  readonly config?: Partial<ClaudeDriverConfig>;
  readonly prepareRun: (req: RunRequest) => Promise<PreparedRun>;
  readonly receipts: ReceiptLookup;
  readonly clock: Clock;
  readonly spawn: SpawnFn;
  readonly git?: GitPort;
  readonly log?: Logger;
  /** Host env the harness inherits (login, PATH); defaults to `process.env`. */
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  /** Signals a POSIX process group on kill; defaults to `process.kill(-pid, signal)`. */
  readonly signalGroup?: (pid: number, signal: NodeJS.Signals) => void;
  /** Replaces the built-in engine factories (tests, or a third engine). */
  readonly engineFactories?: Partial<
    Record<'acp' | 'cli', (deps: EngineDeps) => ClaudeEngine>
  >;
  /** Absolute `bin/hook.js`; defaults to the one shipped in this package. */
  readonly hookJsPath?: string;
  /** Absolute ACP adapter entry; defaults to the pinned dependency. */
  readonly acpEntry?: string;
  /** Home directory used to report which settings files exist. */
  readonly homeDir?: string;
}

export interface KillTreeOptions {
  readonly platform: NodeJS.Platform;
  readonly spawn: SpawnFn;
  /** Signals a whole process group (POSIX); defaults to `process.kill(-pid, sig)`. */
  readonly signalGroup?: (pid: number, signal: NodeJS.Signals) => void;
}

/**
 * Resolved server settings: where things live and how the process behaves.
 *
 * Why: the server composes many adapters that each need a path, a limit or a key. Reading
 *   the environment and the yaml files once, validating them, and passing one resolved
 *   object down means no adapter reads the environment itself and tests can build the
 *   whole server from a literal without touching `process.env`. Config paths (the checkout)
 *   and data paths (the data home) are kept apart so nothing can write data into a repository.
 *
 * Exports: Layout, ServerSettings, HttpTuning.
 * Depends on: @forge/core (DataHomeLayout, ForgeConfig, ProjectConfig). Types only.
 */

import type { DataHomeLayout } from '@forge/core';

/**
 * Absolute paths of everything the server reads or writes. Config paths come from the
 * checkout (until config moves into the database); data paths come from the data home.
 */
export interface Layout {
  /** Folder the yaml config is read from: `FORGE_ROOT` or the cwd. Never holds data. */
  readonly configRoot: string;
  /** Everything Forge owns on the machine: database, secrets, runs, worktrees, backups, logs. */
  readonly data: DataHomeLayout;
  /** `apps/mcp/dist/main.js`, the per-run MCP server entry. */
  readonly mcpEntry: string;
  /** Absolute `bin/hook.js` of `@forge/drivers`, the process the harness runs on each tool event. */
  readonly hookJsPath: string;
}

/** Timers of the HTTP layer; short values let tests run in milliseconds. */
export interface HttpTuning {
  /** How often an open SSE stream looks for new run events. */
  readonly ssePollMs: number;
  /** Interval of the SSE keep-alive comment. */
  readonly sseHeartbeatMs: number;
}

export interface ServerSettings {
  readonly layout: Layout;
  readonly host: string;
  readonly port: number;
  /** Environment handed to project commands and the harness; only an allowlist reaches gates and
   * harness children. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly claudeBinary?: string;
  /** Host variable names the harness may inherit beyond the allowlist (default none). */
  readonly harnessEnvPassthrough: readonly string[];
  readonly engine: 'acp' | 'cli';
  readonly shutdownGraceMs: number;
  readonly http: HttpTuning;
}

/**
 * Resolved server settings: where things live and how the process behaves.
 *
 * Why: the server composes many adapters that each need a path, a limit or a key. Reading
 *   the environment and the yaml files once, validating them, and passing one resolved
 *   object down means no adapter reads the environment itself and tests can build the
 *   whole server from a literal without touching `process.env`.
 *
 * Exports: Layout, ServerSettings, HttpTuning.
 * Depends on: @forge/core (ForgeConfig, ProjectConfig). Types only.
 */

import type { ForgeConfig, ProjectConfig } from '@forge/core';

/** Absolute paths of everything the server reads or writes. */
export interface Layout {
  readonly root: string;
  readonly forgeDir: string;
  readonly dataDir: string;
  readonly dbPath: string;
  readonly runsDir: string;
  readonly secretsDir: string;
  readonly memoryDir: string;
  readonly cataloguePath: string;
  readonly forgeConfigPath: string;
  readonly projectConfigPath: string;
  /** `apps/mcp/dist/main.js`, the per-run MCP server entry. */
  readonly mcpEntry: string;
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
  readonly forge: ForgeConfig;
  readonly project: ProjectConfig;
  /** Environment handed to project commands and the harness; only an allowlist reaches gates and
   * harness children. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Key the tool catalogue is verified with. */
  readonly catalogueKey: string;
  readonly allowDevCatalogueKey: boolean;
  readonly claudeBinary?: string;
  /** Host variable names the harness may inherit beyond the allowlist (default none). */
  readonly harnessEnvPassthrough: readonly string[];
  readonly engine: 'acp' | 'cli';
  readonly shutdownGraceMs: number;
  readonly http: HttpTuning;
}

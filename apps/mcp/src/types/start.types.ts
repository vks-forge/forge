/**
 * Process-effect port for the `forge-mcp` entry.
 *
 * Why: exiting, writing to stderr and opening stdio are the effects that make startup
 *   refusal hard to test; injecting them lets a test prove "wrong token means exit 1"
 *   without killing the test runner.
 *
 * Exports: Env, StartIo, ExistingDatabase, ResearchOverride.
 * Depends on: @forge/core, @modelcontextprotocol/sdk (types only). No IO.
 */

import type { ConfigSource, StorageAdapter } from '@forge/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Process environment as the entry passes it in. */
export type Env = Readonly<Record<string, string | undefined>>;

export interface StartIo {
  exit(code: number): void;
  stderr(message: string): void;
  serve(server: McpServer): Promise<void>;
}

/** Storage and the settings reader on one connection; closing `storage` closes it. */
export interface ExistingDatabase {
  readonly storage: StorageAdapter;
  readonly config: ConfigSource;
}

/** Environment values that replace the stored research settings; for development only. */
export interface ResearchOverride {
  readonly searxngUrl?: string | undefined;
  readonly searxngAllowHosts: readonly string[];
  readonly fetchAllowHosts: readonly string[];
}

/**
 * Dependency and port types for the Forge MCP server.
 *
 * Why: the server is started per run by a driver, but it must also run in-process in
 *   tests with no network and no database file. Everything it touches outside the
 *   process (storage, which also holds the run-token hash, and the web through one
 *   `ResearchProvider`) is a named port here, so the auth check and the web tools can be tested with
 *   stubs. The domain never builds a real network provider: `apps/mcp` supplies one from the owner's
 *   settings, and a web tool whose provider is missing refuses to run instead of silently using the
 *   ambient network (d-0144: one port, one door). Memory works the same way: the tools get a `MemoryIndex`
 *   and a function that returns the run's project and scope, built by `apps/mcp` from the run, its ticket and
 *   its agent, so a tool can never name a project or widen a scope (d-0168).
 *
 * Exports: WorkerResearchLimits, WorkerMemoryScope, ForgeMcpDeps, ToolContext.
 * Depends on: @forge/core (types only). No IO.
 */

import type {
  MemoryIndex,
  MemoryScope,
  ResearchProvider,
  Run,
  StorageAdapter,
} from '@forge/core';

/** What narrows a Worker's fetches; the network floor itself lives in the provider. */
export interface WorkerResearchLimits {
  /** When non-empty, `web_fetch` only reaches these exact hosts. */
  readonly allowHosts: readonly string[];
  /** Hosts `web_fetch` always refuses. */
  readonly denyHosts: readonly string[];
  /** Time box of one fetch or search; the tools default it. */
  readonly timeoutMs?: number;
}

/** Where a run's memory reads happen: its project, the scope its agent allows and its ticket. Built by the server, never by a tool. */
export interface WorkerMemoryScope {
  readonly project: string;
  readonly scope: MemoryScope;
  readonly ticket_id: string;
}

export interface ForgeMcpDeps {
  storage: StorageAdapter;
  runId: string;
  /** Verified against the hash in `storage.runTokens`; never stored. */
  runToken: string;
  /** The one door to the web; absent means `web_search` and `web_fetch` refuse. */
  research?: ResearchProvider;
  researchLimits?: WorkerResearchLimits;
  /** Project memory for the three memory tools; absent means they answer `invalid_input`. */
  memory?: MemoryIndex;
  /** The run's project, memory scope and ticket (run, ticket, project, agent slice); null when any is unknown. */
  memoryScope?: (runId: string) => Promise<WorkerMemoryScope | null>;
  /** Absolute directories `docs_lookup` may read markdown from. */
  docsDirs?: readonly string[];
  docsMaxBytes?: number;
  interactionTimeoutMs?: number;
  now?: () => Date;
  newId?: () => string;
}

/** What a tool handler sees: validated dependencies plus the run row loaded for this call. */
export interface ToolContext {
  deps: ForgeMcpDeps;
  run: Run;
  now(): Date;
  newId(): string;
}

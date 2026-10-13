/**
 * Dependency and port types for the Forge MCP server.
 *
 * Why: the server is started per run by a driver, but it must also run in-process in
 *   tests with no network, no real DNS and no database file. Everything it touches
 *   outside the process (storage, which also holds the run-token hash, DNS, the HTTP socket,
 *   SearXNG) is a named port here, so the SSRF guard and the auth check can be tested with
 *   stubs. The domain never picks a real network implementation: `apps/mcp` supplies
 *   them (via `withDefaultNetwork` in adapters/default-network.ts), and a tool whose port
 *   is missing refuses to run instead of silently using the ambient network.
 *
 * Exports: DnsResolver, HttpRequest, HttpResponse, HttpTransport,
 *   SearxngConfig, ForgeMcpDeps, ToolContext.
 * Depends on: @forge/core (types only). No IO.
 */

import type { Run, StorageAdapter } from '@forge/core';

/** Resolves a host name to every address it points at (A and AAAA); `signal` is the call's time box. */
export type DnsResolver = (host: string, signal?: AbortSignal) => Promise<string[]>;

/** One already-validated hop: connect to `address`, not to whatever `url.hostname` resolves to later. */
export interface HttpRequest {
  url: URL;
  address: string;
  family: 4 | 6;
  signal: AbortSignal;
}

/** Streaming response; the caller enforces the byte cap and destroys the body. */
export interface HttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: AsyncIterable<Uint8Array> & { destroy(): unknown };
}

export type HttpTransport = (req: HttpRequest) => Promise<HttpResponse>;

export interface SearxngConfig {
  baseUrl: string;
  /** Extra non-loopback hosts the operator explicitly trusts (exact host match). */
  allowHosts?: readonly string[];
}

export interface ForgeMcpDeps {
  storage: StorageAdapter;
  runId: string;
  /** Verified against the hash in `storage.runTokens`; never stored. */
  runToken: string;
  searxng?: SearxngConfig;
  /** Absolute directories `docs_lookup` may read markdown from. */
  docsDirs?: readonly string[];
  docsMaxBytes?: number;
  /** When non-empty, `web_fetch` only reaches these exact hosts (and may use ports 8080/8443). */
  fetchAllowHosts?: readonly string[];
  resolve?: DnsResolver;
  transport?: HttpTransport;
  searchFetch?: typeof fetch;
  fetchTimeoutMs?: number;
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

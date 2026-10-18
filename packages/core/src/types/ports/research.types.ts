/**
 * ResearchProvider port — web search and page fetch behind one door.
 *
 * Why: the Director's research step and a Worker's `web_search` / `web_fetch` tools both reach the
 *   outside web, and pages are written by strangers. Every search and fetch therefore goes through
 *   one provider the app builds from the owner's settings (d-0144, d-0085): the same network floor
 *   (SSRF guard, size and time caps), the same answer shape, and one place where a different search
 *   backend plugs in without touching the engine or the MCP server. The provider never throws on a
 *   refusal or an outage; it returns a typed error the caller can show in plain words, so a provider
 *   that is off or down is a note on the card and never a dead end.
 *
 * Exports: ResearchCapabilities, ResearchError, FetchedPage, AbortSignalLike, SearchOutput, SearchOptions,
 *   FetchOptions, ResearchProvider.
 * Depends on: schemas/research, schemas/research-settings, types/result. Types only.
 */

import type { SearchHit } from '#/schemas/research.js';
import type {
  ResearchErrorKind,
  ResearchProviderId,
} from '#/schemas/research-settings.js';
import type { Result } from '#/types/result.types.js';

/** What a provider can do; capabilities are declared, not inferred (code.md rule 3). */
export interface ResearchCapabilities {
  readonly provider: ResearchProviderId;
  readonly search: boolean;
  readonly fetch: boolean;
  /** True when `search` reports a price the engine adds to the card's spend. */
  readonly reportsCost: boolean;
}

export interface ResearchError {
  readonly kind: ResearchErrorKind;
  /** Plain words for the owner or the model. */
  readonly message: string;
}

/** One fetched page: text only (HTML already reduced), with the hash of what was read. */
export interface FetchedPage {
  readonly url: string;
  readonly final_url: string;
  readonly title: string;
  readonly text: string;
  readonly truncated: boolean;
  readonly bytes: number;
  readonly content_type: string;
  readonly sha256: string;
  readonly retrieved_at: string;
}

/** The part of the platform `AbortSignal` the providers read (core has no DOM or node types). */
export interface AbortSignalLike {
  readonly aborted: boolean;
}

export interface SearchOutput {
  readonly hits: SearchHit[];
  readonly cost_usd?: number;
}

export interface SearchOptions {
  readonly maxResults: number;
  /** Search engines to ask (a Worker's `web_search` may name them); absent means the provider's default. */
  readonly engines?: readonly string[];
  readonly signal?: AbortSignalLike;
}

export interface FetchOptions {
  readonly maxBytes: number;
  readonly timeoutMs: number;
  /** When non-empty, only these exact hosts. */
  readonly allowHosts: readonly string[];
  /** Hosts that are always refused. */
  readonly denyHosts: readonly string[];
  readonly signal?: AbortSignalLike;
}

export interface ResearchProvider {
  capabilities(): ResearchCapabilities;
  search(
    query: string,
    opts: SearchOptions,
  ): Promise<Result<SearchOutput, ResearchError>>;
  fetch(url: string, opts: FetchOptions): Promise<Result<FetchedPage, ResearchError>>;
  /** Cheap reachability check for the settings page's Test button. */
  health(): Promise<Result<{ latency_ms: number }, ResearchError>>;
}

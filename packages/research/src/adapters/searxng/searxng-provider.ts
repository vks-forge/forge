/**
 * SearXNG research provider — search through the owner's own SearXNG, fetch through the SSRF guard.
 *
 * Why: the Director's research step and a Worker's web tools need current documentation and error
 *   explanations, but the harness's own web tools are denied so every egress goes through Forge.
 *   SearXNG is self-hosted and keyless, which matches the product's no-keys, no-fees stance (d-0144).
 *   Results are cut to title, url and a short snippet, non-http links are dropped, and the response is
 *   read through a byte-capped stream so a rogue endpoint cannot exhaust memory. A fetch goes through the
 *   same guarded fetcher for every caller, so the network floor is one piece of code. Nothing throws: an
 *   outage or a refusal is a typed error the caller shows in plain words.
 *
 * Exports: createSearxngProvider().
 * Depends on: @forge/core, zod, adapters/searxng/validate-base, shared/guarded-fetch, shared/capped-reader,
 *   shared/research-errors, types/network.types. IO: HTTP to SearXNG and to fetched pages via the ports.
 */

import { err, ok } from '@forge/core';
import type {
  FetchedPage,
  FetchOptions,
  ResearchError,
  ResearchProvider,
  ResearchSettings,
  Result,
  SearchOptions,
  SearchOutput,
} from '@forge/core';
import { z } from 'zod';
import { validateSearxngBase } from '#/adapters/searxng/validate-base.js';
import { readCapped } from '#/shared/capped-reader.js';
import { guardedFetchText } from '#/shared/guarded-fetch.js';
import { researchError, toResearchError } from '#/shared/research-errors.js';
import type { NetworkPorts } from '#/types/network.types.js';

const MAX_BODY_BYTES = 1_000_000;
const SEARCH_TIMEOUT_MS = 10_000;
const SNIPPET_CHARS = 300;
const TITLE_CHARS = 300;

const SearxResponse = z.object({
  results: z.array(
    z.object({
      title: z.string().default(''),
      url: z.string(),
      content: z.string().default(''),
    }),
  ),
});

/** A provider over SearXNG; `now` is injectable so retrieval times are testable. */
export function createSearxngProvider(
  settings: ResearchSettings,
  net: NetworkPorts,
  now: () => Date = () => new Date(),
): ResearchProvider {
  async function search(
    query: string,
    opts: SearchOptions,
  ): Promise<Result<SearchOutput, ResearchError>> {
    try {
      const base = validateSearxngBase(settings.searxng.base_url, settings.searxng.allow_hosts);
      const url = new URL('search', base.href.endsWith('/') ? base.href : `${base.href}/`);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      if (opts.engines && opts.engines.length > 0) {
        url.searchParams.set('engines', opts.engines.join(','));
      }

      const timeout = AbortSignal.timeout(settings.fetch.timeout_ms || SEARCH_TIMEOUT_MS);
      const signal =
        opts.signal instanceof AbortSignal ? AbortSignal.any([timeout, opts.signal]) : timeout;

      const res = await net.fetch(url, {
        redirect: 'error',
        signal,
        headers: { accept: 'application/json' },
      });

      if (!res.ok) {
        return err(researchError('http_error', `SearXNG returned HTTP ${res.status}`));
      }

      const source = res.body as
        (AsyncIterable<Uint8Array> & { cancel(): Promise<void> }) | null;

      const { bytes, truncated } = source
        ? await readCapped(source, MAX_BODY_BYTES, () => source.cancel())
        : { bytes: new Uint8Array(), truncated: false };

      if (truncated) {
        return err(researchError('too_large', 'SearXNG response too large'));
      }

      let parsed: z.infer<typeof SearxResponse>;
      try {
        parsed = SearxResponse.parse(JSON.parse(new TextDecoder().decode(bytes)));
      } catch {
        return err(researchError('bad_content', 'SearXNG returned an unexpected response'));
      }

      return ok({
        hits: parsed.results
          .filter((r) => /^https?:\/\//i.test(r.url))
          .slice(0, opts.maxResults)
          .map((r) => ({
            title: r.title.slice(0, TITLE_CHARS),
            url: r.url,
            snippet: r.content.slice(0, SNIPPET_CHARS),
          })),
      });
    } catch (e) {
      return err(toResearchError(e));
    }
  }

  async function fetchPage(
    rawUrl: string,
    opts: FetchOptions,
  ): Promise<Result<FetchedPage, ResearchError>> {
    try {
      const out = await guardedFetchText(rawUrl, {
        resolve: net.resolve,
        transport: net.transport,
        allowHosts: opts.allowHosts.map((h) => h.toLowerCase()),
        denyHosts: opts.denyHosts,
        timeoutMs: opts.timeoutMs,
        maxBytes: opts.maxBytes,
      });

      return ok({
        url: rawUrl,
        final_url: out.finalUrl,
        title: out.title,
        text: out.text,
        truncated: out.truncated,
        bytes: out.bytes,
        content_type: out.contentType,
        sha256: out.sha256,
        retrieved_at: now().toISOString(),
      });
    } catch (e) {
      return err(toResearchError(e));
    }
  }

  return {
    capabilities: () => ({
      provider: 'searxng',
      search: true,
      fetch: true,
      reportsCost: false,
    }),
    search,
    fetch: fetchPage,
    async health() {
      const started = Date.now();
      const res = await search('forge health check', { maxResults: 1 });

      return res.ok ? ok({ latency_ms: Date.now() - started }) : err(res.error);
    },
  };
}

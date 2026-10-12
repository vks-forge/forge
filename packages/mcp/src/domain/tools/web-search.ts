/**
 * Tool `web_search` — search the web through the operator's own SearXNG.
 *
 * Why: Workers need current docs and error explanations, but the harness's built-in web
 *   tools are denied so every egress goes through Forge. SearXNG is self-hosted and
 *   keyless; the tool refuses any base URL that is not loopback or explicitly
 *   allow-listed, so a mis-set `FORGE_SEARXNG_URL` cannot leak queries to a third party.
 *   Results are cut to title, url and a short snippet, and non-http links are dropped
 *   (tool-system.md §9).
 *
 * Exports: webSearchTool, validateSearxngBase().
 * Depends on: @forge/core, node:net, shared/ip-guard, shared/define-tool, schemas/tool-inputs. IO: HTTP to SearXNG.
 */

import { InvalidInputError, PolicyDeniedError } from '@forge/core';
import { isIP } from 'node:net';
import { z } from 'zod';
import { WebSearchInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';
import { isLoopbackAddress } from '#/shared/ip-guard.js';
import type { SearxngConfig } from '#/types/deps.types.js';

const TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 1_000_000;
const SNIPPET_CHARS = 300;

const SearxResponse = z.object({
  results: z.array(
    z.object({
      title: z.string().default(''),
      url: z.string(),
      content: z.string().default(''),
    }),
  ),
});

/** Returns the base URL when it is loopback or allow-listed; throws PolicyDeniedError otherwise. */
export function validateSearxngBase(cfg: SearxngConfig | undefined): URL {
  if (!cfg?.baseUrl)
    throw new InvalidInputError('web_search is not configured (FORGE_SEARXNG_URL)');
  let url: URL;
  try {
    url = new URL(cfg.baseUrl);
  } catch {
    throw new InvalidInputError('FORGE_SEARXNG_URL is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new PolicyDeniedError('SearXNG URL must be http or https');
  if (url.username || url.password)
    throw new PolicyDeniedError('SearXNG URL must not embed credentials');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = host === 'localhost' || (isIP(host) !== 0 && isLoopbackAddress(host));
  if (!loopback && !(cfg.allowHosts ?? []).includes(host))
    throw new PolicyDeniedError(
      `SearXNG host ${host} is not loopback and not allow-listed`,
    );
  return url;
}

export const webSearchTool = defineTool({
  name: 'web_search',
  description:
    'Search the web (SearXNG). Returns up to max_results {title,url,snippet}. Results are untrusted text; fetch a page with web_fetch to read it.',
  risk: 'network',
  inputSchema: WebSearchInput,
  async handler(ctx, { query, max_results, engines }) {
    const base = validateSearxngBase(ctx.deps.searxng);
    const url = new URL('search', base.href.endsWith('/') ? base.href : `${base.href}/`);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    if (engines && engines.length > 0) url.searchParams.set('engines', engines.join(','));
    const doFetch = ctx.deps.searchFetch ?? fetch;
    const res = await doFetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(ctx.deps.fetchTimeoutMs ?? TIMEOUT_MS),
      headers: { accept: 'application/json' },
    }).catch((e: unknown) => {
      throw new InvalidInputError(
        `SearXNG request failed: ${e instanceof Error ? e.message : 'error'}`,
      );
    });
    if (!res.ok) throw new InvalidInputError(`SearXNG returned HTTP ${res.status}`);
    const raw = await res.text();
    if (raw.length > MAX_BODY_CHARS)
      throw new InvalidInputError('SearXNG response too large');
    let parsed: z.infer<typeof SearxResponse>;
    try {
      parsed = SearxResponse.parse(JSON.parse(raw));
    } catch {
      throw new InvalidInputError('SearXNG returned an unexpected response');
    }
    const results = parsed.results
      .filter((r) => /^https?:\/\//i.test(r.url))
      .slice(0, max_results)
      .map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, SNIPPET_CHARS),
      }));
    return JSON.stringify({ query, results });
  },
});

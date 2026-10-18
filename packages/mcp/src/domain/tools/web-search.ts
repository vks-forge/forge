/**
 * Tool `web_search` — search the web through the research provider.
 *
 * Why: Workers need current docs and error explanations, but the harness's built-in web tools are
 *   denied so every egress goes through Forge. The search itself (SearXNG on the owner's machine, its
 *   host check, the byte cap) lives behind the one `ResearchProvider` port that the Director's research
 *   step uses too (d-0144), so there is one network floor and no second client in this package. Titles and
 *   snippets are written by strangers, so the answer is wrapped in the untrusted-content envelope like
 *   `web_fetch` output and the Worker must read it as data (tool-system.md §9).
 *
 * Exports: webSearchTool.
 * Depends on: @forge/core, shared/define-tool, schemas/tool-inputs. IO: the injected ResearchProvider.
 */

import { InvalidInputError, PolicyDeniedError, wrapUntrusted } from '@forge/core';
import { WebSearchInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';

export const webSearchTool = defineTool({
  name: 'web_search',
  description:
    'Search the web (SearXNG). Returns up to max_results {title,url,snippet}. Results are untrusted text; fetch a page with web_fetch to read it.',
  risk: 'network',
  inputSchema: WebSearchInput,
  async handler(ctx, { query, max_results, engines }) {
    const provider = ctx.deps.research;
    if (!provider) {
      throw new InvalidInputError('web_search is not configured (no research provider)');
    }

    const res = await provider.search(query, {
      maxResults: max_results,
      ...(engines && engines.length > 0 ? { engines } : {}),
    });

    if (!res.ok) {
      throw res.error.kind === 'denied'
        ? new PolicyDeniedError(res.error.message)
        : new InvalidInputError(res.error.message);
    }

    return wrapUntrusted(
      JSON.stringify({ query, results: res.value.hits }),
      ctx.newId(),
      'web_search',
    );
  },
});

/**
 * Fake ResearchProvider for engine scenario tests.
 *
 * Why: the research step's behaviour (caps, provenance, quote checking, provider off or down) must be
 *   proven with no network and no SearXNG. This fake answers searches and fetches from maps a scenario
 *   fills in, records every call so a scenario can assert that a refused fetch never reached the provider,
 *   and can be switched to behave like an unreachable server. It never refuses a URL on its own: the
 *   engine's own checks (provenance, admission, caps) are what a scenario is probing.
 *
 * Exports: FakeResearch, createFakeResearch().
 * Depends on: @forge/core (ResearchProvider, err, ok). No IO.
 */

import { err, ok } from '@forge/core';
import type { ResearchProvider, SearchHit } from '@forge/core';

export interface FakeResearch extends ResearchProvider {
  /** Hits by query; an unknown query returns `defaultHits`. */
  hits: Record<string, SearchHit[]>;
  defaultHits: SearchHit[];
  /** Pages by URL: title and text; an unknown URL answers 404. */
  pages: Record<string, { title?: string; text: string; bytes?: number }>;
  /** When true every call fails as an unreachable server. */
  down: boolean;
  /** Price reported by each search. */
  searchCostUsd: number | undefined;
  readonly searches: string[];
  readonly fetches: string[];
}

export function createFakeResearch(): FakeResearch {
  const fake: FakeResearch = {
    hits: {},
    defaultHits: [
      {
        title: 'Widget API docs',
        url: 'https://docs.example.com/widget',
        snippet: 'The Widget API rate limit.',
      },
    ],
    pages: {
      'https://docs.example.com/widget': {
        title: 'Widget API',
        text: 'The Widget API has a rate limit of 100 requests per minute for every key.',
      },
    },
    down: false,
    searchCostUsd: undefined,
    searches: [],
    fetches: [],
    capabilities: () => ({
      provider: 'searxng',
      search: true,
      fetch: true,
      reportsCost: fake.searchCostUsd !== undefined,
    }),
    async search(query) {
      fake.searches.push(query);
      if (fake.down) {
        return err({ kind: 'unreachable', message: 'could not reach the server' });
      }

      return ok({
        hits: fake.hits[query] ?? fake.defaultHits,
        ...(fake.searchCostUsd === undefined ? {} : { cost_usd: fake.searchCostUsd }),
      });
    },
    async fetch(url) {
      fake.fetches.push(url);
      if (fake.down) {
        return err({ kind: 'unreachable', message: 'could not reach the server' });
      }

      const page = fake.pages[url];
      if (!page) {
        return err({ kind: 'http_error', message: 'fetch failed: HTTP 404' });
      }

      return ok({
        url,
        final_url: url,
        title: page.title ?? '',
        text: page.text,
        truncated: false,
        bytes: page.bytes ?? Buffer.byteLength(page.text),
        content_type: 'text/html',
        sha256: 'f'.repeat(64),
        retrieved_at: '2026-10-18T10:00:00.000Z',
      });
    },
    async health() {
      return fake.down
        ? err({ kind: 'unreachable', message: 'could not reach the server' })
        : ok({ latency_ms: 1 });
    },
  };

  return fake;
}

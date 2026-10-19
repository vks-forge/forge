/**
 * Research requests: runs a research step's searches and fetches through the research grant and the provider.
 *
 * Why: the research step is a tool-less model call that asks the engine for outside facts, and what it
 *   asks for next is shaped by pages written by strangers. Every request is therefore judged by the engine
 *   before anything leaves the machine, in the strictest order: the run's caps first (a hit returns a
 *   "cap reached" result the step sees, never a crash), then provenance (a fetch is allowed only for a URL
 *   from this run's own search results, the card or the owner's answers, so a page cannot steer the next
 *   fetch to an exfiltration URL), then `admitResearch` (the one policy door: http(s) only, no credentials,
 *   no private address, banned hosts), then the provider with its own SSRF guard. Every page becomes a
 *   numbered source held in the run's state, and what the model sees of it is a capped excerpt inside an
 *   untrusted-content envelope with an id the page cannot know. A refusal is a result row, so the model can
 *   adapt; the queries are recorded for the card's log.
 *
 * Exports: newResearchState(), runRequests(), fitResultsToPrompt(), PAGE_EXCERPT_CHARS, PROMPT_RESULTS_CHARS.
 * Depends on: @forge/core (fetchAllowed, normaliseUrl, wrapUntrusted), @forge/tools (admitResearch),
 *   shared/ids, types/card-planning, types/research-run. IO: the injected ResearchProvider.
 */

import { fetchAllowed, normaliseUrl, wrapUntrusted } from '@forge/core';
import type { ResearchRequest, ResearchResult } from '@forge/core';
import { admitResearch } from '@forge/tools';
import { nonce } from '#/shared/ids.js';
import type { PlanCtx } from '#/types/card-planning.types.js';
import type { KnownCardUrls, ResearchState } from '#/types/research-run.types.js';

/** What the model sees of one page: the first part, so one source cannot flood the step's input. */
export const PAGE_EXCERPT_CHARS = 12_000;

/**
 * Most page text the step's input carries at once (about 100k tokens). The owner may allow up to 100
 * pages a run (d-0171); without this the pages of a long run would add up past the model's context.
 */
export const PROMPT_RESULTS_CHARS = 400_000;

const SEARCH_RESULTS = 8;
const PAGE_MAX_BYTES = 2 * 1024 * 1024;
const DOWN_KINDS = new Set(['unreachable', 'timeout', 'not_configured']);

export function newResearchState(firstRef: number): ResearchState {
  return {
    searches: [],
    hitUrls: [],
    sources: [],
    nextRef: firstRef,
    searchCount: 0,
    fetchCount: 0,
    bytes: 0,
    answered: 0,
    unreachable: 0,
    costUsd: 0,
  };
}

const refuse = (request: ResearchRequest, error: string): ResearchResult => ({
  request,
  ok: false,
  error,
});

/** Runs the requests in order; each is judged before it is sent and a failure is a result, never a throw. */
export async function runRequests(
  pc: PlanCtx,
  requests: readonly ResearchRequest[],
  state: ResearchState,
  known: KnownCardUrls,
): Promise<ResearchResult[]> {
  const out: ResearchResult[] = [];
  for (const request of requests) {
    try {
      out.push(
        request.op === 'search'
          ? await doSearch(pc, request, state)
          : await doFetch(pc, request, state, known),
      );
    } catch (e) {
      out.push(refuse(request, e instanceof Error ? e.message : String(e)));
    }
  }

  return out;
}

const limitsOf = (pc: PlanCtx) => ({
  allowHosts: pc.research.allowHosts,
  denyHosts: pc.research.denyHosts,
});

async function doSearch(
  pc: PlanCtx,
  request: Extract<ResearchRequest, { op: 'search' }>,
  state: ResearchState,
): Promise<ResearchResult> {
  const caps = pc.director.research;
  if (state.searchCount >= caps.max_searches) {
    return refuse(
      request,
      `cap reached: at most ${caps.max_searches} searches per research run`,
    );
  }

  const verdict = admitResearch(request, limitsOf(pc));
  if (verdict.decision !== 'allow') {
    return refuse(request, `denied: ${verdict.reason}`);
  }

  const provider = pc.ctx.deps.research;
  if (!provider) {
    return refuse(request, 'research is off');
  }

  state.searchCount += 1;
  state.searches.push(request.query);
  const res = await provider.search(request.query, { maxResults: SEARCH_RESULTS });
  if (!res.ok) {
    return failed(request, res.error.kind, res.error.message, state);
  }

  state.answered += 1;
  state.costUsd += res.value.cost_usd ?? 0;
  state.hitUrls.push(...res.value.hits.map((h) => h.url));

  return {
    request,
    ok: true,
    text: wrapUntrusted(JSON.stringify(res.value.hits), nonce(), 'search results'),
  };
}

function failed(
  request: ResearchRequest,
  kind: string,
  message: string,
  state: ResearchState,
): ResearchResult {
  if (DOWN_KINDS.has(kind)) {
    state.unreachable += 1;
  }

  return refuse(request, message);
}

async function doFetch(
  pc: PlanCtx,
  request: Extract<ResearchRequest, { op: 'fetch' }>,
  state: ResearchState,
  known: KnownCardUrls,
): Promise<ResearchResult> {
  const caps = pc.director.research;
  const wanted = normaliseUrl(request.url);
  const again = state.sources.find((s) => normaliseUrl(s.page.url) === wanted);
  if (again) {
    return pageResult(
      request,
      again.ref,
      again.page.final_url,
      again.page.text,
      again.page.truncated,
    );
  }

  if (state.fetchCount >= caps.max_fetches) {
    return refuse(
      request,
      `cap reached: at most ${caps.max_fetches} pages per research run`,
    );
  }

  if (state.bytes >= caps.max_bytes) {
    return refuse(
      request,
      `cap reached: the run has read its ${caps.max_bytes} bytes of pages`,
    );
  }

  if (!fetchAllowed(request.url, { hits: state.hitUrls, ...known })) {
    return refuse(
      request,
      'refused: this URL was not in your search results, the card or the owner answers; search for it first',
    );
  }

  const verdict = admitResearch(request, limitsOf(pc));
  if (verdict.decision !== 'allow') {
    return refuse(request, `denied: ${verdict.reason}`);
  }

  const provider = pc.ctx.deps.research;
  if (!provider) {
    return refuse(request, 'research is off');
  }

  state.fetchCount += 1;
  const res = await provider.fetch(request.url, {
    maxBytes: Math.min(PAGE_MAX_BYTES, caps.max_bytes - state.bytes),
    timeoutMs: pc.ctx.config.forge.research.fetch.timeout_ms,
    ...limitsOf(pc),
  });

  if (!res.ok) {
    return failed(request, res.error.kind, res.error.message, state);
  }

  state.answered += 1;
  state.bytes += res.value.bytes;
  const ref = `S${state.nextRef}`;
  state.nextRef += 1;
  state.sources.push({ ref, page: res.value });

  return pageResult(
    request,
    ref,
    res.value.final_url,
    res.value.text,
    res.value.truncated,
  );
}

function pageResult(
  request: ResearchRequest,
  ref: string,
  url: string,
  text: string,
  truncated: boolean,
): ResearchResult {
  const excerpt = text.slice(0, PAGE_EXCERPT_CHARS);

  return {
    request,
    ok: true,
    source: ref,
    text: wrapUntrusted(excerpt, nonce(), url),
    truncated: truncated || excerpt.length < text.length,
  };
}

/**
 * The results as the next model call sees them: the newest pages keep their text up to
 * `PROMPT_RESULTS_CHARS`, older ones keep their row and source ref but lose the text (marked truncated).
 * The pages stay stored in full, so a quote from one is still checked against it.
 */
export function fitResultsToPrompt(
  results: readonly ResearchResult[],
  maxChars: number = PROMPT_RESULTS_CHARS,
): ResearchResult[] {
  let left = maxChars;
  const fitted: ResearchResult[] = [];
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i] as ResearchResult;
    if (r.text === undefined) {
      fitted.push(r);
    } else if (r.text.length <= left) {
      left -= r.text.length;
      fitted.push(r);
    } else {
      const bare = { ...r, truncated: true };
      delete bare.text;
      fitted.push(bare);
    }
  }

  return fitted.reverse();
}

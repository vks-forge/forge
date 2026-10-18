/**
 * Types of one research run: what it has fetched so far and what it found.
 *
 * Why: a research run is a finite loop of model calls and engine-run requests. Everything it learns lives
 *   in memory until the run ends, and is written once, in one transaction, with the step's result: a run
 *   that fails or is cut off by a restart leaves no half-stored page behind and starts again from its first
 *   round with the same numbering (`S1`, `S2`, ...). The state is what the caps and the provenance check read
 *   (searches and fetches made, bytes used, the URLs the search returned) and what the store writes
 *   (the pages with their text, the queries for the card's log).
 *
 * Exports: FetchedSource, ResearchState, KnownCardUrls, ResearchAsk, ResearchRun, ResearchEnd.
 * Depends on: @forge/core (FetchedPage, ResearchFindings, SourceRef). Types only.
 */

import type { FetchedPage, ResearchFindings, SourceRef } from '@forge/core';

/** A page fetched in this run, numbered but not yet stored. */
export interface FetchedSource {
  readonly ref: SourceRef;
  readonly page: FetchedPage;
}

/** What a run has done so far; the request runner updates it and the caps read it. */
export interface ResearchState {
  /** Queries the run sent, for the card's log. */
  readonly searches: string[];
  /** URLs the searches returned: the only search-born URLs a fetch may name. */
  readonly hitUrls: string[];
  readonly sources: FetchedSource[];
  /** Number part of the next source ref. */
  nextRef: number;
  searchCount: number;
  fetchCount: number;
  bytes: number;
  /** Requests that got an answer from the provider. */
  answered: number;
  /** Requests that failed because the provider could not be reached. */
  unreachable: number;
  /** Dollars the provider reported for searches. */
  costUsd: number;
}

/** URLs the engine knows without any page text: the card's own and the owner's. */
export interface KnownCardUrls {
  readonly cardUrls: readonly string[];
  readonly answerUrls: readonly string[];
}

/** How a run ended and what it learned. */
export interface ResearchEnd {
  /** The model's findings; null when the provider could not be used at all. */
  readonly findings: ResearchFindings | null;
  readonly state: ResearchState;
  /** Dollars of the model calls plus the provider's price. */
  readonly cost: number;
  /** A plain-words note for the owner when the run could not do its job. */
  readonly note?: string;
  /** What stayed open when there are no findings (nothing was looked up). */
  readonly open?: readonly string[];
}

/** A finished run, or the outcome the flow loop should return because a model call failed. */
export type ResearchRun =
  | { readonly ok: true; readonly end: ResearchEnd }
  | { readonly ok: false; readonly outcome: 'stop' | 'blocked' };

/** What the Director asks the research step to find out: questions to answer and outside claims to check. */
export interface ResearchAsk {
  readonly questions: readonly string[];
  readonly claims: readonly string[];
}

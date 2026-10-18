/**
 * Shapes of the research screens: grouped claims, a highlighted page, the Conversation line.
 *
 * Why: the Evidence tab, the source drawer and the research line in the Conversation each
 *   derive a view from server rows (group claims under their question, split a page around a
 *   quote, turn a `research` event into one sentence). Naming those derived shapes keeps the
 *   pure functions that build them (domain/research-evidence, domain/research-copy) apart from
 *   the components that draw them, so each is testable alone.
 *
 * Exports: EvidenceGroup, PageParts, ResearchLineView, ProviderTestWords, BudgetCapParse.
 * Depends on: @forge/core (types). Types only.
 */

import type { EvidenceView } from '@forge/core';

/** The claims that answer one question, in the order the Director found them. */
export interface EvidenceGroup {
  /** The question, or null for claims the Director did not tie to one. */
  readonly question: string | null;
  readonly claims: readonly EvidenceView[];
}

/** A source's text split around the first place its quote appears; `quote` is empty when it is not on the page. */
export interface PageParts {
  readonly before: string;
  readonly quote: string;
  readonly after: string;
}

/** One `research` event as the Conversation says it. */
export interface ResearchLineView {
  /** "Researched: 3 searches, ..." or "Research could not run". */
  readonly text: string;
  /** The plain-words reason the server gave when nothing was looked up, or a limit or warning. */
  readonly note: string | null;
  /** Open questions the research left unanswered. */
  readonly unanswered: readonly string[];
  /** True when the note is about settings the owner can change (research off, provider down). */
  readonly settingsHelp: boolean;
}

/** A provider test result in words: what happened and, when it failed, what to do. */
export interface ProviderTestWords {
  readonly ok: boolean;
  readonly headline: string;
  readonly fix: string | null;
}

/** The budget cap box read as a value (`null` clears the cap) or a problem in words. */
export type BudgetCapParse =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly message: string };

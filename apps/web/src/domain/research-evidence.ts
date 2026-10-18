/**
 * Research evidence rules: how claims, sources and quotes are read for the owner.
 *
 * Why: the Director leans on facts it found on the web, and the owner decides whether a plan
 *   may start on them. A claim is Verified only when the engine found one of its quotes on the
 *   stored page (the model's word proves nothing); an Unverified claim says why in plain words.
 *   The page text is written by a stranger, so it is shown as plain text and the quote is
 *   marked inside it; an address is linked only when it is really http or https, so a
 *   `javascript:` link in a page can never become a clickable link. Grouping, counting and the
 *   one-line summaries are kept here, away from React, so tests can pin them.
 *
 * Exports: domainOf(), safeHref(), groupByQuestion(), unverifiedCount(), claimReason(),
 *   runsLine(), splitAtQuote(), evidenceAnchor(), sourceFacts(), OPEN_LINK_REL.
 * Depends on: @forge/core (types), types/research-ui.types. No IO.
 */

import type { EvidenceView, ResearchSource } from '@forge/core';
import type { EvidenceGroup, PageParts } from '#/types/research-ui.types.js';

/** `rel` for every link that leaves Forge: no opener handle, no referrer, no SEO credit. */
export const OPEN_LINK_REL = 'noopener noreferrer nofollow';

/** The host of a URL without a leading `www.`, or the text itself when it is not a URL. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** The URL when it is http or https, else null: nothing else is ever made a link. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Claims under the question they answer, groups in first-seen order, claims in their given order. */
export function groupByQuestion(evidence: readonly EvidenceView[]): EvidenceGroup[] {
  const groups = new Map<string, EvidenceView[]>();

  for (const claim of evidence) {
    const key = claim.question ?? '';
    const list = groups.get(key);

    if (list) {
      list.push(claim);
    } else {
      groups.set(key, [claim]);
    }
  }

  return [...groups].map(([question, claims]) => ({
    question: question === '' ? null : question,
    claims,
  }));
}

export function unverifiedCount(evidence: readonly { status: string }[]): number {
  return evidence.filter((e) => e.status === 'unverified').length;
}

/** Why a claim is Unverified; null for a verified one. */
export function claimReason(claim: Pick<EvidenceView, 'status'>): string | null {
  return claim.status === 'verified' ? null : 'No quote matched the page';
}

/** "Research used 2 of 4 runs". */
export function runsLine(used: number, cap: number): string {
  return `Research used ${used} of ${cap} run${cap === 1 ? '' : 's'}`;
}

/** The DOM id a claim is linked by (`#evidence-E1`), so the Plan tab can point at it. */
export function evidenceAnchor(ref: string): string {
  return `evidence-${ref}`;
}

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * The page split around the first place `quote` appears, compared the way the engine
 * compared it: without regard to case or runs of whitespace. When it is not found the whole
 * text is `before` and the quote part is empty.
 */
export function splitAtQuote(text: string, quote: string | undefined): PageParts {
  const words = (quote ?? '').trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return { before: text, quote: '', after: '' };
  }

  const found = new RegExp(words.map(escapeRegExp).join(String.raw`\s+`), 'i').exec(text);

  if (!found) {
    return { before: text, quote: '', after: '' };
  }

  return {
    before: text.slice(0, found.index),
    quote: found[0],
    after: text.slice(found.index + found[0].length),
  };
}

/** The provenance facts of a source, as label and value pairs, empty ones left out. */
export function sourceFacts(
  source: ResearchSource,
): readonly { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [
    { label: 'Read by', value: source.origin === 'worker' ? 'A Worker' : 'The Director' },
    { label: 'Address', value: source.url },
  ];

  if (source.final_url !== source.url) {
    facts.push({ label: 'Ended up at', value: source.final_url });
  }

  facts.push(
    { label: 'Fingerprint (sha256)', value: source.sha256 },
    { label: 'Size', value: `${source.bytes.toLocaleString('en-US')} bytes` },
  );

  if (source.truncated) {
    facts.push({
      label: 'Cut short',
      value: 'The page was longer than Forge keeps; the stored text ends early.',
    });
  }

  return facts;
}

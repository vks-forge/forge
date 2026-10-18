/**
 * Pins: how research evidence is read for the owner: which addresses may become links, how
 * claims group under their question, why a claim is unverified, and where a quote sits in a
 * stored page (compared without regard to case or runs of whitespace, as the engine compared it).
 *
 * Why: the page text and addresses come from strangers. A `javascript:` address that became a
 *   link, or a quote mark that landed on the wrong text, would let a hostile page act on or
 *   mislead the owner. Each rule is pure, so it is held here without a screen.
 * Depends on: domain/research-evidence. No DOM.
 */

import type { EvidenceView, ResearchSource } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  claimReason,
  domainOf,
  evidenceAnchor,
  groupByQuestion,
  runsLine,
  safeHref,
  sourceFacts,
  splitAtQuote,
  unverifiedCount,
} from '#/domain/research-evidence.js';

const claim = (ref: string, question?: string, status = 'verified'): EvidenceView =>
  ({
    id: 1,
    card_id: 'FG-C9',
    ref,
    step_id: 'research',
    origin: 'research_step',
    ...(question === undefined ? {} : { question }),
    claim: `Claim ${ref}`,
    quotes: [],
    sources: [],
    status,
    created_at: '2026-10-16T09:00:00.000Z',
    source_list: [],
  }) as unknown as EvidenceView;

describe('addresses', () => {
  it('names the domain without www, and falls back to the text when it is not a URL', () => {
    expect(domainOf('https://www.docs.example.com/a?b=1')).toBe('docs.example.com');
    expect(domainOf('not a url')).toBe('not a url');
  });

  it('links only http and https, never script, data or file addresses', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('http://example.com')).toBe('http://example.com/');

    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>1</script>',
      'file:///etc/passwd',
      'vbscript:x',
      '//example.com',
      '',
    ]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe('claims', () => {
  it('groups under the question in first-seen order and keeps unquestioned ones together', () => {
    const groups = groupByQuestion([
      claim('E1', 'A?'),
      claim('E2'),
      claim('E3', 'A?'),
      claim('E4', 'B?'),
    ]);

    expect(groups.map((g) => [g.question, g.claims.map((c) => c.ref)])).toEqual([
      ['A?', ['E1', 'E3']],
      [null, ['E2']],
      ['B?', ['E4']],
    ]);
  });

  it('counts unverified claims and says why only for those', () => {
    expect(unverifiedCount([claim('E1'), claim('E2', undefined, 'unverified')])).toBe(1);
    expect(claimReason(claim('E1'))).toBeNull();
    expect(claimReason(claim('E2', undefined, 'unverified'))).toBe(
      'No quote matched the page',
    );
  });

  it('says how much of the allowance is used, and names the anchor a plan links to', () => {
    expect(runsLine(2, 4)).toBe('Research used 2 of 4 runs');
    expect(runsLine(0, 1)).toBe('Research used 0 of 1 run');
    expect(evidenceAnchor('E7')).toBe('evidence-E7');
  });
});

describe('finding a quote in a page', () => {
  const text = 'Intro.\nThe API allows 100 requests per\n  minute per key.\nOutro.';

  it('marks the first match across line breaks and case', () => {
    expect(splitAtQuote(text, 'ALLOWS 100 requests per minute')).toEqual({
      before: 'Intro.\nThe API ',
      quote: 'allows 100 requests per\n  minute',
      after: ' per key.\nOutro.',
    });
  });

  it('treats characters that mean something in a pattern as plain text', () => {
    expect(
      splitAtQuote('cost is $5.00 (net) [approx]', '$5.00 (net) [approx]').quote,
    ).toBe('$5.00 (net) [approx]');

    expect(splitAtQuote('abc', '.*').quote).toBe('');
  });

  it('returns the whole page unmarked when there is no quote or it is not on the page', () => {
    expect(splitAtQuote(text, undefined)).toEqual({ before: text, quote: '', after: '' });
    expect(splitAtQuote(text, '   ')).toEqual({ before: text, quote: '', after: '' });
    expect(splitAtQuote(text, 'not here')).toEqual({
      before: text,
      quote: '',
      after: '',
    });
  });
});

describe('provenance', () => {
  const source = {
    id: 1,
    project: 'p',
    origin: 'director',
    url: 'https://a.example/x',
    final_url: 'https://a.example/x',
    title: 't',
    retrieved_at: '2026-10-16T09:00:00.000Z',
    sha256: 'abc',
    bytes: 12_345,
    truncated: false,
  } as unknown as ResearchSource;

  it('lists who read it, the address, the fingerprint and the size', () => {
    expect(sourceFacts(source)).toEqual([
      { label: 'Read by', value: 'The Director' },
      { label: 'Address', value: 'https://a.example/x' },
      { label: 'Fingerprint (sha256)', value: 'abc' },
      { label: 'Size', value: '12,345 bytes' },
    ]);
  });

  it('adds where a redirect ended and that the stored text was cut short', () => {
    const labels = sourceFacts({
      ...source,
      origin: 'worker',
      final_url: 'https://b.example/y',
      truncated: true,
    }).map((f) => f.label);

    expect(labels).toEqual([
      'Read by',
      'Address',
      'Ended up at',
      'Fingerprint (sha256)',
      'Size',
      'Cut short',
    ]);
  });
});

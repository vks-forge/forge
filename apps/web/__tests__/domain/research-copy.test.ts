/**
 * Pins: the sentences the owner reads about research: the Conversation line for a run (and for
 * a run that could not look anything up), which notes point at settings, a provider test in
 * plain words, the plan's unverified-facts banner, and how the budget cap box is read.
 *
 * Why: research touches the open web and money, so each outcome needs words an owner can act
 *   on. A "research could not run" that read like a success, or a provider failure that said
 *   only "unreachable", would leave the owner guessing; a cap box that turned a typo into 0
 *   would warn at once. The wording is the contract, so it is held here.
 * Depends on: domain/research-copy. No DOM.
 */

import { RESEARCH_ERROR_KINDS } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  noteNeedsSettings,
  outsideFactsBanner,
  parseBudgetCap,
  providerTestWords,
  researchLineOf,
  RESEARCH_ERROR_FIX,
} from '#/domain/research-copy.js';

const payload = (over: Record<string, unknown> = {}) => ({
  step_id: 'research',
  origin: 'research_step',
  searches: ['a', 'b', 'c'],
  fetched: [
    { ref: 'S1', url: 'u1' },
    { ref: 'S2', url: 'u2' },
  ],
  claims: [
    { ref: 'E1', status: 'verified' },
    { ref: 'E2', status: 'unverified' },
  ],
  unanswered: [],
  cost_usd: 0.3,
  ...over,
});

describe('the research line', () => {
  it('counts searches, pages and facts and names the unverified ones', () => {
    expect(researchLineOf(payload())).toEqual({
      text: 'Researched: 3 searches, 2 pages, 2 facts (1 unverified)',
      note: null,
      unanswered: [],
      settingsHelp: false,
    });
  });

  it('uses the singular and leaves out an unverified count of none', () => {
    expect(
      researchLineOf(
        payload({
          searches: ['a'],
          fetched: [{ ref: 'S1', url: 'u' }],
          claims: [{ ref: 'E1', status: 'verified' }],
        }),
      ).text,
    ).toBe('Researched: 1 search, 1 page, 1 fact');
  });

  it('says research could not run when nothing was looked up and a note says why', () => {
    const line = researchLineOf(
      payload({
        searches: [],
        fetched: [],
        claims: [],
        unanswered: ['Which API version?'],
        note: 'Research is off, so nothing was looked up.',
      }),
    );

    expect(line.text).toBe('Research could not run');
    expect(line.note).toBe('Research is off, so nothing was looked up.');
    expect(line.unanswered).toEqual(['Which API version?']);
    expect(line.settingsHelp).toBe(true);
  });

  it('keeps the counts when a run found things and still left a note', () => {
    const line = researchLineOf(
      payload({
        note: 'Instructions aimed at the Director were found in S2 and ignored.',
      }),
    );

    expect(line.text).toMatch(/^Researched: /);
    expect(line.note).toMatch(/ignored/);
    expect(line.settingsHelp).toBe(false);
  });

  it('falls back to a neutral line for a payload it cannot read', () => {
    expect(researchLineOf({ searches: 'x' }).text).toBe('Research ran.');
    expect(researchLineOf(null).text).toBe('Research ran.');
  });

  it('points at settings only for the notes settings can fix', () => {
    expect(
      noteNeedsSettings('Research is off. Turn it on in Forge settings, Research.'),
    ).toBe(true);

    expect(noteNeedsSettings('The search provider did not answer.')).toBe(true);
    expect(
      noteNeedsSettings('The research limit for this card (4 runs) is reached.'),
    ).toBe(false);

    expect(noteNeedsSettings(undefined)).toBe(false);
  });
});

describe('a provider test in words', () => {
  it('reports the latency on success, and none when it is not given', () => {
    expect(providerTestWords({ ok: true, provider: 'searxng', latency_ms: 84 })).toEqual({
      ok: true,
      headline: 'The search provider answered in 84 ms.',
      fix: null,
    });

    expect(providerTestWords({ ok: true, provider: 'searxng' }).headline).toBe(
      'The search provider answered.',
    );
  });

  it('gives the server message as the headline and a fix for every kind of failure', () => {
    for (const kind of RESEARCH_ERROR_KINDS) {
      const words = providerTestWords({
        ok: false,
        provider: 'searxng',
        error: { kind, message: `Problem: ${kind}` },
      });

      expect(words.ok).toBe(false);
      expect(words.headline).toBe(`Problem: ${kind}`);
      expect(words.fix).toBe(RESEARCH_ERROR_FIX[kind]);
      expect(words.fix?.length).toBeGreaterThan(20);
    }
  });

  it('does not invent a cause when the failure carries none', () => {
    expect(providerTestWords({ ok: false, provider: 'none' })).toMatchObject({
      headline: 'The provider did not answer.',
      fix: RESEARCH_ERROR_FIX.not_configured,
    });
  });
});

describe('the unverified-facts banner', () => {
  it('says how many outside facts lack a check, and is absent when none do', () => {
    expect(outsideFactsBanner(1)).toBe(
      'Needs your approval: rests on 1 unverified outside fact',
    );

    expect(outsideFactsBanner(3)).toBe(
      'Needs your approval: rests on 3 unverified outside facts',
    );

    expect(outsideFactsBanner(0)).toBeNull();
  });
});

describe('the budget cap box', () => {
  it('reads an empty box as no cap, never as zero', () => {
    expect(parseBudgetCap('')).toEqual({ ok: true, value: null });
    expect(parseBudgetCap('   ')).toEqual({ ok: true, value: null });
  });

  it('reads dollars, with or without a sign, rounded to cents', () => {
    expect(parseBudgetCap('12.5')).toEqual({ ok: true, value: 12.5 });
    expect(parseBudgetCap('$20')).toEqual({ ok: true, value: 20 });
    expect(parseBudgetCap('1.239')).toEqual({ ok: true, value: 1.24 });
    expect(parseBudgetCap('0')).toEqual({ ok: true, value: 0 });
  });

  it('says what is wrong with anything else', () => {
    expect(parseBudgetCap('lots')).toEqual({
      ok: false,
      message: 'Enter a number of dollars, or leave it empty.',
    });

    expect(parseBudgetCap('-1')).toEqual({
      ok: false,
      message: 'A cap cannot be below 0.',
    });

    expect(parseBudgetCap('Infinity')).toMatchObject({ ok: false });
  });
});

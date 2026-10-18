/**
 * Pins the research schemas that stand between a page and the rest of the system.
 *
 * Why: the research step reads text written by strangers, so what it may answer is narrow by design (d-0144):
 *   requests for searches and fetches, or findings made of claims and exact quotes, never an action. The schema
 *   is the first wall: one of the two answers and nothing else, bounded lengths, http(s) fetches only, refs of a
 *   fixed shape, and a stored plan or settings document from before research must still parse.
 *
 * Pins: ResearchOutput accepts exactly one of requests or findings and drops unknown keys; request and quote
 *   bounds; non-http fetch refused; ref shapes; the plan verification defaults; the grill turn's research
 *   detour only while the grill is not done; the research flow settings validate.
 * Depends on: src/schemas/research, src/schemas/plan, src/schemas/director-steps, src/schemas/director-config,
 *   src/domain/builtin-director, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import { DirectorConfig } from '#/schemas/director-config.js';
import { GrillTurnOutput } from '#/schemas/director-steps.js';
import { PlanVerification } from '#/schemas/plan.js';
import {
  EvidenceRef,
  ResearchOutput,
  ResearchRequest,
  SourceRef,
} from '#/schemas/research.js';

const findings = { summary: 's', claims: [], unanswered: [] };

describe('ResearchOutput', () => {
  it('accepts requests or findings, never both and never neither', () => {
    const search = [{ op: 'search', query: 'widget rate limit' }];

    expect(ResearchOutput.safeParse({ research_requests: search }).success).toBe(true);
    expect(ResearchOutput.safeParse({ findings }).success).toBe(true);
    expect(
      ResearchOutput.safeParse({ research_requests: search, findings }).success,
    ).toBe(false);

    expect(ResearchOutput.safeParse({}).success).toBe(false);
  });

  it('drops anything else a page talked the model into adding', () => {
    const out = ResearchOutput.parse({
      findings,
      run_shell: 'rm -rf /',
      status: 'verified',
    });

    expect(Object.keys(out)).toEqual(['findings']);
    expect(out.findings?.injection_seen).toEqual([]);
  });

  it('bounds queries, fetch URLs, quotes and the number of requests and claims', () => {
    expect(ResearchRequest.safeParse({ op: 'search', query: 'ab' }).success).toBe(false);
    expect(
      ResearchRequest.safeParse({ op: 'search', query: 'x'.repeat(201) }).success,
    ).toBe(false);

    expect(
      ResearchRequest.safeParse({ op: 'fetch', url: 'file:///etc/passwd' }).success,
    ).toBe(false);

    expect(
      ResearchRequest.safeParse({ op: 'fetch', url: 'https://a.example/x' }).success,
    ).toBe(true);

    const claim = (quote: string) => ({
      text: 'A claim long enough',
      quotes: [{ source: 'S1', quote }],
    });

    for (const [quote, ok] of [
      ['too short', false],
      ['q'.repeat(20), true],
      ['q'.repeat(301), false],
    ] as const) {
      expect(
        ResearchOutput.safeParse({ findings: { ...findings, claims: [claim(quote)] } })
          .success,
      ).toBe(ok);
    }

    const many = Array.from({ length: 11 }, () => ({
      op: 'search',
      query: 'widget limit',
    }));

    expect(ResearchOutput.safeParse({ research_requests: many }).success).toBe(false);
  });
});

describe('refs', () => {
  it('are S or E followed by a positive number', () => {
    expect(['S1', 'S12'].every((r) => SourceRef.safeParse(r).success)).toBe(true);
    expect(
      ['S0', 'E1', 's1', 'S', 'S01'].some((r) => SourceRef.safeParse(r).success),
    ).toBe(false);

    expect(['E1', 'E30'].every((r) => EvidenceRef.safeParse(r).success)).toBe(true);
    expect(['E0', 'S1', 'E-1'].some((r) => EvidenceRef.safeParse(r).success)).toBe(false);
  });
});

describe('older documents still parse', () => {
  it('a plan verification without evidence gets empty lists', () => {
    const v = PlanVerification.parse({
      blast_radius: 'small',
      files_read: [],
      overlaps: [],
      matching_decisions: [],
      rejected_hits: [],
      risks: [],
    });

    expect(v.evidence).toEqual([]);
    expect(v.outside_claims).toEqual([]);
  });

  it('the built-in Director settings validate with the research caps and one research step', () => {
    expect(DirectorConfig.safeParse(BUILTIN_DIRECTOR_CONFIG).success).toBe(true);
    expect(
      BUILTIN_DIRECTOR_CONFIG.flow.filter((s) => s.kind === 'research'),
    ).toHaveLength(1);
  });
});

describe('GrillTurnOutput research detour', () => {
  const draft = {
    text: 'Where?',
    options: [
      { label: 'a', recommended: true },
      { label: 'b', recommended: false },
    ],
  };

  const turn = (over: Record<string, unknown>) =>
    GrillTurnOutput.safeParse({ open_points: 1, assumptions: [], ...over }).success;

  it('lets an unfinished turn ask for research instead of a question, one to three questions', () => {
    const research = { questions: ['What is the Widget API rate limit?'] };

    expect(turn({ done: false, research })).toBe(true);
    expect(turn({ done: false, research, question: draft })).toBe(true);
    expect(turn({ done: false })).toBe(false);
    expect(turn({ done: false, research: { questions: [] } })).toBe(false);
    expect(
      turn({
        done: false,
        research: { questions: Array(4).fill('A question about it') },
      }),
    ).toBe(false);
  });

  it('refuses research on a finished grill', () => {
    expect(
      turn({
        done: true,
        done_reason: 'nothing_open',
        research: { questions: ['What is the limit?'] },
      }),
    ).toBe(false);
  });
});

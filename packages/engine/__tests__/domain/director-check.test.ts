/**
 * Pins what the Director's check is shown, and how its answer becomes findings.
 *
 * Why: the check against the plan exists to be independent of the Worker (d-0141 item 9). If the
 *   Worker's own account (its narrative) or its self-reported claims reached the step, a confident
 *   story could talk the Director into passing work that does not meet the plan, which is exactly
 *   the failure a second look is for. So the input is built from typed artifacts only and the two
 *   Worker-authored kinds are stripped even if a caller passes them in. The model's answer is also
 *   not taken at its word: an unmet criterion becomes a high finding and an unclear one a medium
 *   finding (so it can block), and a claim that the work is out of plan without a single file
 *   outside the plan's list is not trusted as a scope drift but fails closed as a blocking finding.
 *
 * Pins: buildCheckInput never carries narrative or finish_claims, whatever it is given; keeps the
 *   typed kinds in order and the unplanned list; synthesizeReview turns `no` into high and
 *   `unclear` into medium, keeps the model's findings, reports a scope drift only with unplanned
 *   files, and fails closed on out_of_plan with none; a clean pass has no blocking finding.
 * Depends on: src/domain/director-check, vitest.
 */

import type { TicketCheckOutput } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  CHECK_ARTIFACT_KINDS,
  buildCheckInput,
  synthesizeReview,
} from '#/domain/director-check.js';

const draft = (kind: string, content: string) => ({
  kind,
  content,
  truncated: false,
  sha256: '0'.repeat(64),
});

const out = (over: Partial<TicketCheckOutput> = {}): TicketCheckOutput => ({
  verdict: 'pass',
  summary: 'ok',
  acceptance: [{ criterion: 'lists tickets', met: 'yes', evidence: 'a.ts:1' }],
  findings: [],
  confidence: 0.8,
  ...over,
});

describe('buildCheckInput', () => {
  it('never carries the Worker narrative or its finish claims', () => {
    const input = buildCheckInput({
      artifacts: [
        draft('ticket', 'the ticket'),
        draft('narrative', 'SENTINEL-NARRATIVE I did everything perfectly'),
        draft('finish_claims', 'SENTINEL-CLAIMS {"claims":[]}'),
        draft('diff', 'the diff'),
      ] as never,
      unplanned: [],
      playbook: null,
      houseRules: '',
    });

    const text = JSON.stringify(input);

    expect(input.artifacts.map((a) => a.kind)).toEqual(['ticket', 'diff']);
    expect(text).not.toContain('SENTINEL');
    expect(CHECK_ARTIFACT_KINDS).not.toContain('narrative');
    expect(CHECK_ARTIFACT_KINDS).not.toContain('finish_claims');
  });

  it('keeps the typed artifacts in order, the unplanned files and the method text', () => {
    const input = buildCheckInput({
      artifacts: [
        draft('plan', 'acceptance: x'),
        draft('diff', 'd'),
        draft('gate_report', 'g'),
      ] as never,
      unplanned: ['a.txt'],
      playbook: { id: 'check-against-plan', title: 'T', body: 'B' },
      houseRules: 'be brief',
    });

    expect(input.artifacts.map((a) => a.kind)).toEqual(['plan', 'diff', 'gate_report']);
    expect(input.unplanned).toEqual(['a.txt']);
    expect(input.playbook).toEqual({ id: 'check-against-plan', title: 'T', body: 'B' });
    expect(input.house_rules).toBe('be brief');
  });
});

describe('synthesizeReview', () => {
  it('turns an unmet criterion into a high finding and an unclear one into a medium finding', () => {
    const r = synthesizeReview(
      out({
        verdict: 'changes',
        acceptance: [
          { criterion: 'A', met: 'no', evidence: 'missing' },
          { criterion: 'B', met: 'unclear', evidence: 'cannot tell' },
          { criterion: 'C', met: 'yes', evidence: 'fine' },
        ],
      }),
      [],
    );

    expect(r.review.findings.map((f) => f.severity)).toEqual(['high', 'medium']);
    expect(r.review.verdict).toBe('changes');
    expect(r.scopeDrift).toBe(false);
  });

  it('keeps the model findings and a clean pass has none that block', () => {
    const r = synthesizeReview(
      out({
        findings: [{ severity: 'low', issue: 'naming', evidence: 'a.ts:2' }],
      }),
      [],
    );

    expect(r.review.verdict).toBe('pass');
    expect(r.review.findings).toHaveLength(1);
  });

  it('reports a scope drift only when files outside the plan exist', () => {
    const drift = synthesizeReview(out({ verdict: 'out_of_plan' }), ['x/y.ts']);

    expect(drift.scopeDrift).toBe(true);
  });

  it('fails closed when it says out_of_plan but no file lies outside the plan', () => {
    const r = synthesizeReview(out({ verdict: 'out_of_plan' }), []);

    expect(r.scopeDrift).toBe(false);
    expect(r.review.findings.some((f) => f.severity === 'high')).toBe(true);
    expect(r.review.verdict).toBe('changes');
  });
});

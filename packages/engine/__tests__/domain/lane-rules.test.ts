/**
 * Tests for the lane decision rule applied around the `triage` step.
 *
 * Why: lane is the process-weight dial (director-core.md §6). The model proposes, but the
 *   deterministic pre-check can only raise it, a "quick" hint must not be able to talk a
 *   risky ticket down, and low confidence must move work one lane up so doubt costs process,
 *   not safety. These rules decide whether M0 runs a ticket or parks it, so they are pinned
 *   without any model or storage.
 *
 * Pins: pre-check wins over the model and over a quick hint; quick + clean pre-check is
 *   Express whatever the confidence; confidence below the threshold moves one lane up;
 *   a "full" hint is Full; more than six predicted files is at least Standard; a tier-C
 *   glob hit makes the tier C; the lane is never lower than the pre-check lane.
 * Depends on: src/domain/lane-rules, @forge/core (preCheckLane), vitest, fast-check.
 */

import { preCheckLane } from '@forge/core';
import type { TriageOutput } from '@forge/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideLane } from '#/domain/lane-rules.js';

const llm = (over: Partial<TriageOutput> = {}): TriageOutput => ({
  lane: 'express',
  confidence: 0.9,
  predicted_files: ['src/a.ts'],
  questions: [],
  type: 'fix',
  tier_predicted: 'A',
  title: 'Fix a thing',
  ...over,
});

const run = (
  over: Partial<TriageOutput> = {},
  extra: { hint?: 'quick' | 'full'; globs?: string[]; bodyLength?: number } = {},
) => {
  const out = llm(over);
  const globs = extra.globs ?? ['**/auth/**'];
  const pre = preCheckLane({
    touchedPaths: out.predicted_files,
    tierCGlobs: globs,
    bodyLength: extra.bodyLength ?? 100,
    type: out.type,
  });
  return decideLane({
    pre,
    llm: out,
    ...(extra.hint ? { hint: extra.hint } : {}),
    threshold: 0.7,
    tierCGlobs: globs,
  });
};

describe('decideLane', () => {
  it('keeps Express for a confident, clean express proposal', () => {
    expect(run().lane).toBe('express');
  });

  it('a tier-C path makes the lane Full and the tier C, even with a quick hint', () => {
    const d = run({ predicted_files: ['src/auth/login.ts'] }, { hint: 'quick' });
    expect(d.lane).toBe('full');
    expect(d.tier).toBe('C');
  });

  it('a quick hint with a clean pre-check is Express regardless of confidence or model lane', () => {
    expect(run({ lane: 'standard', confidence: 0.1 }, { hint: 'quick' }).lane).toBe(
      'express',
    );
  });

  it('a full hint is Full', () => {
    expect(run({}, { hint: 'full' }).lane).toBe('full');
  });

  it('low confidence moves the lane one up, never two', () => {
    expect(run({ confidence: 0.69 }).lane).toBe('standard');
    expect(run({ lane: 'standard', confidence: 0.2 }).lane).toBe('full');
    expect(run({ lane: 'full', confidence: 0.2 }).lane).toBe('full');
  });

  it('confidence exactly at the threshold does not move the lane', () => {
    expect(run({ confidence: 0.7 }).lane).toBe('express');
  });

  it('more than six predicted files is at least Standard', () => {
    const files = Array.from({ length: 7 }, (_, i) => `src/f${i}.ts`);
    expect(run({ predicted_files: files }).lane).not.toBe('express');
  });

  it('a long body raises the lane through the pre-check even when the model says Express', () => {
    expect(run({}, { bodyLength: 5000 }).lane).toBe('standard');
  });

  it('never returns a lane below a pre-check hit (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('express', 'standard', 'full'),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.option(fc.constantFrom('quick', 'full'), { nil: undefined }),
        fc.integer({ min: 0, max: 4000 }),
        fc.array(fc.constantFrom('src/a.ts', 'src/auth/x.ts', 'b.md'), { maxLength: 8 }),
        (lane, confidence, hint, bodyLength, files) => {
          const out = llm({ lane, confidence, predicted_files: files });
          const pre = preCheckLane({
            touchedPaths: files,
            tierCGlobs: ['**/auth/**'],
            bodyLength,
            type: 'fix',
          });
          const d = decideLane({
            pre,
            llm: out,
            ...(hint ? { hint } : {}),
            threshold: 0.7,
            tierCGlobs: ['**/auth/**'],
          });
          const rank = { express: 0, standard: 1, full: 2 } as const;
          // A pre-check hit can never be talked down (the quick hint only applies to a clean one).
          if (pre.reasons.length > 0)
            expect(rank[d.lane]).toBeGreaterThanOrEqual(rank[pre.lane]);
        },
      ),
    );
  });
});

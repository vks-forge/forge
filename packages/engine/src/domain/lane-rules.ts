/**
 * Lane decision around the `triage` step.
 *
 * Why: lane is the process-weight dial (director-core.md §6). The model proposes, but the
 *   deterministic pre-check can only raise it, a "quick" hint must not talk a risky
 *   ticket down, and low confidence moves work one lane up so doubt costs process, not
 *   safety. In M0 the lane also decides whether the ticket runs (Express) or waits for a
 *   human, so the rule is pure and pinned without a model or storage.
 *
 * Exports: decideLane().
 * Depends on: @forge/core (maxLane, globMatch, Lane), types/lane-rules. No IO.
 */

import { globMatch, maxLane } from '@forge/core';
import type { Lane, Tier } from '@forge/core';
import type { LaneDecision, LaneInput } from '#/types/lane-rules.types.js';

const UP: Record<Lane, Lane> = { express: 'standard', standard: 'full', full: 'full' };

/** Pre-check wins, a clean "quick" hint is Express, "full" is Full, doubt moves one lane up. */
export function decideLane(input: LaneInput): LaneDecision {
  const { pre, llm, hint, threshold, tierCGlobs } = input;
  const clean = pre.reasons.length === 0;
  const reasons: string[] = [...pre.reasons];
  const tierC = llm.predicted_files.some((p) => tierCGlobs.some((g) => globMatch(g, p)));
  const tier: Tier = tierC ? 'C' : llm.tier_predicted;

  if (hint === 'full') {
    return {
      lane: 'full',
      tier,
      reasons: [...reasons, 'user asked for the full process'],
    };
  }

  if (hint === 'quick' && clean) {
    return { lane: 'express', tier, reasons: ['user asked for a quick change'] };
  }

  let lane = clean ? llm.lane : maxLane(pre.lane, llm.lane);
  if (llm.confidence < threshold) {
    lane = UP[lane];
    reasons.push(`confidence ${llm.confidence} < ${threshold}: one lane up`);
  }

  return { lane, tier, reasons };
}

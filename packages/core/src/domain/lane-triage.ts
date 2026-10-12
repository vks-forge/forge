/**
 * Deterministic lane pre-check — the first, cheap step of lane triage.
 *
 * Why: lanes start light and only escalate on signal (director-core.md §6 step 1,
 *   execution-plane.md §2). A pure function over path globs, brief size and ticket type
 *   lets the Director raise a lane without an LLM call; tier-C globs force Full
 *   (verification-plane.md, d-0034). Nothing here ever lowers a lane.
 *
 * Exports: EXPRESS_MAX_FILES, EXPRESS_MAX_BODY_CHARS, maxLane(), PreCheckInput,
 *   PreCheckResult, preCheckLane().
 * Depends on: shared/glob, schemas/ticket, types/lane-triage. No IO.
 */

import { globMatch } from '#/shared/glob.js';
import type { Lane } from '#/schemas/ticket.js';
import type { PreCheckInput, PreCheckResult } from '#/types/lane-triage.types.js';

const LANE_RANK: Record<Lane, number> = { express: 0, standard: 1, full: 2 };

/** Express is "1-3 files predicted" (execution-plane.md §2). */
export const EXPRESS_MAX_FILES = 3;
/** Long briefs are rarely typo-sized; triage refines from here. */
export const EXPRESS_MAX_BODY_CHARS = 2000;

/** Returns the heavier of two lanes (express < standard < full). */
export function maxLane(a: Lane, b: Lane): Lane {
  return LANE_RANK[a] >= LANE_RANK[b] ? a : b;
}

/** Deterministic pre-check (director-core.md §6 step 1). Only raises; the LLM triage step and in-run signals may raise further, nothing lowers. */
export function preCheckLane(input: PreCheckInput): PreCheckResult {
  const reasons: string[] = [];
  let lane: Lane = input.currentLane ?? 'express';
  const raise = (to: Lane, reason: string): void => {
    reasons.push(reason);
    lane = maxLane(lane, to);
  };

  const paths = input.touchedPaths ?? [];
  const hits = paths.filter((p) => input.tierCGlobs.some((g) => globMatch(g, p)));
  if (hits.length > 0) raise('full', `tier-C path touched: ${hits.join(', ')}`);
  if (paths.length > EXPRESS_MAX_FILES) {
    raise('standard', `${paths.length} files predicted (> ${EXPRESS_MAX_FILES})`);
  }
  if (input.bodyLength > EXPRESS_MAX_BODY_CHARS) {
    raise('standard', `body length ${input.bodyLength} > ${EXPRESS_MAX_BODY_CHARS}`);
  }
  if (input.type === 'ci') raise('standard', 'ci changes touch infra surface');

  return { lane, reasons };
}

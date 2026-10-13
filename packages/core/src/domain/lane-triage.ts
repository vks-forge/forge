/**
 * Deterministic lane pre-check — the first, cheap step of lane triage.
 *
 * Why: process weight is the factory's main cost-versus-safety dial: a typo fix should
 *   not pay for an epic, an interview and six gates, but a change to auth or migrations
 *   must never ride the cheap lane. The Director starts every ticket light and escalates
 *   on signal, and the first free signal is deterministic: touched paths against the
 *   project's tier-C globs, predicted file count, ticket body length and ticket type. As
 *   a pure function it needs no LLM call, answers identically on replay, and can only
 *   raise a lane, so a later model step or an optimistic Worker cannot talk a risky
 *   ticket down to Express (director-core.md §6, execution-plane.md §2, d-0034).
 *
 * Exports: EXPRESS_MAX_FILES, EXPRESS_MAX_BODY_CHARS, maxLane(), preCheckLane().
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
  if (hits.length > 0) {
    raise('full', `tier-C path touched: ${hits.join(', ')}`);
  }

  if (paths.length > EXPRESS_MAX_FILES) {
    raise('standard', `${paths.length} files predicted (> ${EXPRESS_MAX_FILES})`);
  }

  if (input.bodyLength > EXPRESS_MAX_BODY_CHARS) {
    raise('standard', `body length ${input.bodyLength} > ${EXPRESS_MAX_BODY_CHARS}`);
  }

  if (input.type === 'ci') {
    raise('standard', 'ci changes touch infra surface');
  }

  return { lane, reasons };
}

/**
 * Bypass step of admit() — turns a lane `ask` into `allow` when the grant says bypass.
 *
 * Why: with "Bypass permissions" on (d-0183) a Worker must never stop for an approval, so
 *   the lane's `ask` outcomes (installs, edits under `migrations/`, unlisted commands, risky
 *   shell constructs) are allowed. The hard floor (secrets, Forge's data folder, outside the
 *   worktree, push and publish, destructive commands) is not: a floor rule that shows up as
 *   an `ask` becomes `deny`, never `allow`. An `ask` raised by an inspector or a budget is
 *   not a lane rule and stays an `ask`. The flag comes from the grant only, and only the
 *   literal `true` counts, so a missing or odd value keeps today's behaviour. A `deny` is
 *   never touched (tool-system.md §5.6, d-0183).
 *
 * Exports: applyBypass(), BYPASS_RULE.
 * Depends on: domain/hard-floor, types/admit. No IO.
 */

import { isHardFloorRule } from '#/domain/hard-floor.js';
import type { AdmitContext, AdmitDraft as Draft } from '#/types/admit.types.js';

/** `matched_rule` recorded on a call that bypass allowed, so the history shows why. */
export const BYPASS_RULE = 'bypass';

/** Applies bypass to an `ask` draft; anything else is returned unchanged. `gated` marks an inspector or budget ask. */
export function applyBypass(ctx: AdmitContext, draft: Draft, gated: boolean): Draft {
  if (ctx.grant.bypass !== true || draft.decision !== 'ask') {
    return draft;
  }

  if (isHardFloorRule(draft.rule)) {
    return { ...draft, decision: 'deny', reason: 'managed_deny', layer: 'floor' };
  }

  if (gated) {
    return draft;
  }

  return {
    ...draft,
    decision: 'allow',
    reason: 'bypass',
    layer: 'rule',
    rule: BYPASS_RULE,
  };
}

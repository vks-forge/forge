/**
 * Approval step of admit() — lets the owner's answers settle an `ask`.
 *
 * Why: on Standard and Full a call the lane marks `ask` (an install, an edit under
 *   `migrations/`) is parked for the owner. Once the owner answers, the resumed Worker
 *   repeats the call and policy must honour the answer without a second door: "allow once"
 *   lets exactly that call through, "deny" refuses it without asking again, and an
 *   "always" rule stored on the project lifts the lane's ask for matching calls. The step can
 *   only turn an `ask` into allow or deny; floors, managed rules and every project, ticket or
 *   agent deny have already decided by the time it runs, so no approval can widen a grant.
 *   Express never reads approvals (nobody is there to have given them) (tool-system.md §5.4, d-0175).
 *
 * Exports: applyApproval().
 * Depends on: domain/admit-call-rules, domain/approval-key, domain/approved-rules, domain/call-resource,
 *   domain/lane-defaults, domain/tool-id, schemas/grant, schemas/tool-definition, shared/path, types/admit. No IO.
 */

import { callRules } from '#/domain/admit-call-rules.js';
import { approvalKey } from '#/domain/approval-key.js';
import { protectedPathHit, usableApproved } from '#/domain/approved-rules.js';
import { PATH_TOOLS, pathResources } from '#/domain/call-resource.js';
import { LANE_UNATTENDED } from '#/domain/lane-defaults.js';
import { toolAction } from '#/domain/tool-id.js';
import type { CallRule } from '#/schemas/grant.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import { normalizePath } from '#/shared/path.js';
import type {
  AdmitCall,
  AdmitContext,
  AdmitDraft as Draft,
} from '#/types/admit.types.js';

const LIFTABLE = new Set(['rule_ask', 'no_matching_rule']);

/** True when a path tool touches a protected path (or names none); "always" can never cover one. */
function touchesProtected(
  ctx: AdmitContext,
  def: ToolDefinition,
  call: AdmitCall,
): boolean {
  const action = toolAction(def.id);
  if (!PATH_TOOLS.has(action)) {
    return false;
  }

  const paths = pathResources(action, call.input);

  return paths === null || paths.some((p) => protectedPathHit(normalizePath(p, ctx.cwd)));
}

/** Re-judges the call with `extra` allow rules added to the lane layer; true when the verdict is allow. */
function allowedWith(
  ctx: AdmitContext,
  def: ToolDefinition,
  call: AdmitCall,
  extra: readonly CallRule[],
): boolean {
  const shadow: AdmitContext = {
    ...ctx,
    grant: {
      ...ctx.grant,
      ruleLayers: ctx.grant.ruleLayers.map((l, i) =>
        i === 0 ? { ...l, rules: [...l.rules, ...extra] } : l,
      ),
    },
  };

  return callRules(shadow, def, call).decision === 'allow';
}

/** The approved rule id (or ids, for a chain) that make the call allowed, or `null`. */
function alwaysRuleId(
  ctx: AdmitContext,
  def: ToolDefinition,
  call: AdmitCall,
): string | null {
  const rules = usableApproved(ctx.grant);
  if (rules.length === 0 || touchesProtected(ctx, def, call)) {
    return null;
  }

  const single = rules.find((r) => allowedWith(ctx, def, call, [r]));
  if (single) {
    return single.id ?? null;
  }

  // A chain can need several approved rules at once (one per asking segment).
  return allowedWith(ctx, def, call, rules) ? rules.map((r) => r.id).join(',') : null;
}

const settled = (
  draft: Draft,
  decision: 'allow' | 'deny',
  reason: Draft['reason'],
  rule: string,
): Draft => ({ ...draft, decision, reason, layer: 'approval', rule });

/**
 * Applies the owner's answers to an `ask` draft. `gated` is true when an inspector or a
 * budget also asked: those are not lane rules, so an "always" rule never lifts them.
 * Anything that is not an `ask`, or runs on an unattended lane, is returned unchanged.
 */
export function applyApproval(
  ctx: AdmitContext,
  def: ToolDefinition,
  call: AdmitCall,
  draft: Draft,
  gated: boolean,
): Draft {
  const unattended = LANE_UNATTENDED[ctx.grant.lane] || ctx.unattended === true;
  if (draft.decision !== 'ask' || unattended) {
    return draft;
  }

  const key = approvalKey(ctx, call);
  const denied =
    key === null ? undefined : ctx.approvals?.denied.find((a) => a.key === key);

  if (denied) {
    return settled(draft, 'deny', 'approval_denied', `approval:${denied.ref}`);
  }

  const once = key === null ? undefined : ctx.approvals?.once.find((a) => a.key === key);
  if (once) {
    return settled(draft, 'allow', 'approved_once', `approval:${once.ref}`);
  }

  if (gated || !LIFTABLE.has(draft.reason)) {
    return draft;
  }

  const rule = alwaysRuleId(ctx, def, call);

  return rule === null ? draft : settled(draft, 'allow', 'approved_always', rule);
}

/**
 * admit() — the one door every tool listing and tool call goes through.
 *
 * Why: a Worker's tool set is built once and its calls arrive later, sometimes from
 *   inside meta-tools or code-mode scripts. If listing, calling and nested calling each
 *   had their own check, a tool could be listed but refused, or reached through a wrapper
 *   without being checked at all. `admit` is the single function all of them use: it
 *   verifies the catalogue, the live schema hash, harness enforcement, the capability
 *   grant, call-time rules, inspectors and budgets, in that order, and can only ever
 *   tighten as it goes, except that the owner's recorded answer to an `ask` may settle it (approval step) or the grant's bypass flag lifts a non-floor `ask` (bypass step). Any error inside it becomes `deny`; an `ask` that nobody can
 *   answer (Express, unattended) becomes `deny` too, so no gate waits on nobody. A path
 *   tool whose input names no usable string path is refused, never treated as "the cwd".
 *   The lane is read from the grant only, so a context cannot claim a looser lane
 *   (tool-system.md §5, §5.5, §12).
 *
 * Exports: admit(), visibleTools().
 * Depends on: domain/catalogue, domain/data-home-floor, domain/grants, domain/lane-defaults, domain/budgets,
 *   domain/admit-draft, domain/admit-call-rules, domain/admit-approval, domain/admit-bypass, schemas/decision, types/admit. No IO.
 */

import { SEVERITY, deny, raise } from '#/domain/admit-draft.js';
import { applyApproval } from '#/domain/admit-approval.js';
import { applyBypass } from '#/domain/admit-bypass.js';
import { callRules } from '#/domain/admit-call-rules.js';
import { checkBudget } from '#/domain/budgets.js';
import { schemaMatches } from '#/domain/catalogue.js';
import { DATA_HOME_UNKNOWN_RULE, dataHomeKnown } from '#/domain/data-home-floor.js';
import { checkToolGranted } from '#/domain/grants.js';
import { LANE_UNATTENDED } from '#/domain/lane-defaults.js';
import type { Decision } from '#/schemas/decision.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import { toolMatch } from '#/shared/pattern.js';
import type {
  AdmitCall,
  AdmitContext,
  AdmitDraft as Draft,
  InspectorResult,
} from '#/types/admit.types.js';

function finish(
  call: AdmitCall,
  d: Draft,
  enforcement: Decision['enforcement'],
): Decision {
  return {
    decision: d.decision,
    reason: d.reason,
    enforced_by: 'forge_admit',
    enforcement,
    layer: d.layer,
    matched_rule: d.rule,
    finding_ids: d.findings,
    tool: call.tool,
  };
}

function checkReach(
  ctx: AdmitContext,
  def: ToolDefinition,
  call: AdmitCall,
): Draft | null {
  const via = call.via ?? 'direct';
  if (via === 'direct') {
    return null;
  }

  const parent =
    ctx.catalogue.status === 'verified' && call.parent_tool !== undefined
      ? ctx.catalogue.tools.get(call.parent_tool)
      : undefined;

  if (!parent || !parent.reaches_tools.some((p) => toolMatch(p, def.id))) {
    return deny('not_reachable', 'capability');
  }

  return null;
}

function decide(
  ctx: AdmitContext,
  call: AdmitCall,
): { draft: Draft; enforcement: Decision['enforcement'] } {
  const no = (d: Draft, e: Decision['enforcement'] = null) => ({
    draft: d,
    enforcement: e,
  });

  // The grant is the single source of the lane; a context that disagrees is a wiring bug.
  if (ctx.lane !== ctx.grant.lane) {
    return no(deny('inspector_error', 'floor'));
  }

  // A floor that cannot say where Forge's data lives must not guess: deny everything.
  if (!dataHomeKnown(ctx.grant.dataHome)) {
    return no(deny('inspector_error', 'floor', DATA_HOME_UNKNOWN_RULE));
  }

  if (ctx.catalogue.status !== 'verified') {
    return no(deny('quarantined', 'floor'));
  }

  const def = ctx.catalogue.tools.get(call.tool);
  if (!def) {
    return no(deny('unknown_tool', 'capability'));
  }

  const support = def.support[ctx.harness] ?? def.support['*'];
  if (!support) {
    return no(deny('unsupported_harness', 'capability'));
  }

  const enf = support.enforced;
  const via = call.via ?? 'direct';

  if (def.exposure === 'hidden' || (def.exposure === 'codemode' && via !== 'codemode')) {
    return no(deny('exposure', 'capability'), enf);
  }

  // A native tool whose schema for this harness build is not approved: say which of the two.
  const schemaState = Object.hasOwn(ctx.schemaStatus ?? {}, def.id)
    ? ctx.schemaStatus?.[def.id]
    : undefined;

  if (schemaState === 'pending') {
    return no(deny('schema_pending', 'floor'), enf);
  }

  if (schemaState === 'denied') {
    return no(deny('schema_denied', 'floor'), enf);
  }

  if (!schemaMatches(def, ctx.liveSchemaHashes)) {
    return no(deny('schema_changed', 'floor'), enf);
  }

  if (
    ctx.grant.lane === 'full' &&
    (def.risk === 'network' || def.risk === 'credential') &&
    enf !== 'os' &&
    enf !== 'server'
  ) {
    return no(deny('enforcement_insufficient', 'capability'), enf);
  }

  const gv = checkToolGranted(ctx.grant, def.id);
  if (!gv.granted) {
    return no(deny('not_granted', 'capability', gv.rule), enf);
  }

  const reach = checkReach(ctx, def, call);
  if (reach) {
    return no(reach, enf);
  }

  if (call.phase === 'list') {
    return no(
      {
        decision: 'allow',
        reason: 'allowed',
        layer: 'capability',
        rule: null,
        findings: [],
      },
      enf,
    );
  }

  let draft = callRules(ctx, def, call);
  // An inspector or budget `ask` is not a lane rule: an "always" approval must not lift it.
  let gated = false;
  if (draft.decision !== 'deny') {
    for (const inspect of ctx.inspectors ?? []) {
      let r: InspectorResult;
      try {
        r = inspect(ctx, call);
      } catch {
        return no(deny('inspector_error', 'inspector'), enf);
      }

      if (!Object.hasOwn(SEVERITY, r.effect)) {
        return no(deny('inspector_error', 'inspector'), enf);
      }

      gated ||= r.effect === 'ask';
      draft = raise(draft, {
        decision: r.effect,
        reason: 'inspector_raised',
        layer: 'inspector',
        rule: null,
        findings: r.finding_id === undefined ? [] : [r.finding_id],
      });
    }
  }

  if (draft.decision !== 'deny' && ctx.budget) {
    const b = checkBudget(
      ctx.budget.limits,
      ctx.budget.usage,
      def.id,
      call.estimated_usd ?? 0,
    );

    if (b.verdict === 'deny') {
      draft = raise(draft, deny('budget_exceeded', 'rule'));
    } else if (b.verdict === 'ask') {
      gated = true;
      draft = raise(draft, {
        decision: 'ask',
        reason: 'budget_soft_limit',
        layer: 'rule',
        rule: null,
        findings: [],
      });
    }
  }

  // Owner answers settle an `ask` only: attended lanes, after every deny and budget, before the unattended conversion.
  return no(applyBypass(ctx, applyApproval(ctx, def, call, draft, gated), gated), enf);
}

/**
 * Judges one listing (`phase: 'list'`) or call. Never throws: any internal error is a
 * `deny` with `reason: inspector_error`. An `ask` becomes `deny` (`unattended`) when
 * nobody can answer it; that is the default on the Express lane.
 */
export function admit(ctx: AdmitContext, call: AdmitCall): Decision {
  let draft: Draft;
  let enforcement: Decision['enforcement'] = null;
  try {
    ({ draft, enforcement } = decide(ctx, call));
    // Nobody to answer an `ask` on an unattended lane; `ctx.unattended` can only tighten.
    const unattended = LANE_UNATTENDED[ctx.grant.lane] || ctx.unattended === true;
    if (draft.decision === 'ask' && unattended) {
      draft = { ...draft, decision: 'deny', reason: 'unattended', layer: 'approval' };
    }
  } catch {
    draft = deny('inspector_error', 'floor');
  }

  return finish(call, draft, enforcement);
}

/**
 * Tool ids visible to the model under `ctx`, with their exposure. Built from `admit()`
 * with `phase: 'list'`, so the list can never contain a tool a call would refuse on
 * grounds knowable before the call.
 */
export function visibleTools(
  ctx: AdmitContext,
): { id: string; exposure: ToolDefinition['exposure'] }[] {
  if (ctx.catalogue.status !== 'verified') {
    return [];
  }

  const out: { id: string; exposure: ToolDefinition['exposure'] }[] = [];
  for (const def of ctx.catalogue.tools.values()) {
    if (admit(ctx, { phase: 'list', tool: def.id }).decision === 'allow') {
      out.push({ id: def.id, exposure: def.exposure });
    }
  }

  return out;
}

/**
 * admit() — the one door every tool listing and tool call goes through.
 *
 * Why: a Worker's tool set is built once and its calls arrive later, sometimes from
 *   inside meta-tools or code-mode scripts. If listing, calling and nested calling each
 *   had their own check, a tool could be listed but refused, or reached through a wrapper
 *   without being checked at all. `admit` is the single function all of them use: it
 *   verifies the catalogue, the live schema hash, harness enforcement, the capability
 *   grant, call-time rules, inspectors and budgets, in that order, and can only ever
 *   tighten as it goes. Any error inside it becomes `deny`; an `ask` that nobody can
 *   answer (Express, unattended) becomes `deny` too, so no gate waits on nobody. A path
 *   tool whose input names no usable string path is refused, never treated as "the cwd".
 *   The lane is read from the grant only, so a context cannot claim a looser lane
 *   (tool-system.md §5, §5.5, §12).
 *
 * Exports: admit(), visibleTools().
 * Depends on: domain/catalogue, domain/grants, domain/lane-defaults, domain/rules, domain/budgets, domain/tokenizer,
 *   domain/tool-id, schemas/decision, types/admit. No IO.
 */

import { checkBudget } from '#/domain/budgets.js';
import { schemaMatches } from '#/domain/catalogue.js';
import { checkToolGranted } from '#/domain/grants.js';
import { LANE_UNATTENDED } from '#/domain/lane-defaults.js';
import { evaluateShell, evaluateToolRules } from '#/domain/rules.js';
import { SHELL_TOOL_ID, isProjectMcp, toolAction } from '#/domain/tool-id.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import type { Decision, DecisionLayer, ReasonCode } from '#/schemas/decision.js';
import type { Effect } from '#/schemas/grant.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import { toolMatch } from '#/shared/pattern.js';
import type {
  AdmitCall,
  AdmitContext,
  AdmitDraft as Draft,
  InspectorResult,
} from '#/types/admit.types.js';

const SEVERITY: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };
const RESOURCE_KEYS = ['url', 'query', 'name'];
/** Fields a harness uses to name the file or directory of a path tool. */
const PATH_KEYS = ['file_path', 'path', 'notebook_path'] as const;
const PATH_TOOLS = new Set(['read', 'edit', 'write', 'grep', 'glob']);

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

const deny = (
  reason: ReasonCode,
  layer: DecisionLayer,
  rule: string | null = null,
): Draft => ({
  decision: 'deny',
  reason,
  layer,
  rule,
  findings: [],
});

/**
 * The resources a path tool touches, or `null` when the input does not name one safely.
 * Every present path field must be a string (a number or object in `path` is a bypass
 * attempt, not a path), and at least one must be non-empty. For `grep` the pattern stands
 * in for a missing path (it is judged as a path too, conservatively); for `glob` the
 * pattern is judged both alone and joined to `path`, so `../..` inside a pattern cannot
 * climb out.
 */
function pathResources(action: string, input: AdmitCall['input']): string[] | null {
  const given: string[] = [];
  for (const k of [...PATH_KEYS, 'pattern']) {
    const v = input?.[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return null;
    if (k !== 'pattern') given.push(v);
  }
  const pattern = input?.['pattern'];
  const hasPattern =
    typeof pattern === 'string' && (action === 'grep' || action === 'glob');
  if (hasPattern) {
    if (pattern.trim() === '') return null;
    if (action === 'grep' && given.length === 0) given.push(pattern);
    if (action === 'glob') {
      const base = given.length > 0 ? given : ['.'];
      given.push(
        ...base.map((b) =>
          /^([a-zA-Z]:|[\\/~])/.test(pattern) ? pattern : `${b}/${pattern}`,
        ),
      );
    }
  }
  return given.length === 0 || given.some((g) => g.trim() === '') ? null : given;
}

function resourceOf(def: ToolDefinition, call: AdmitCall): string {
  if (isProjectMcp(def.id)) return def.id;
  for (const k of RESOURCE_KEYS) {
    const v = call.input?.[k];
    if (typeof v === 'string') return v;
  }
  return '';
}

/** Raises `cur` to `next` only if `next` is stricter; findings accumulate. */
function raise(cur: Draft, next: Draft): Draft {
  return SEVERITY[next.decision] > SEVERITY[cur.decision]
    ? { ...next, findings: [...cur.findings, ...next.findings] }
    : cur;
}

function checkReach(
  ctx: AdmitContext,
  def: ToolDefinition,
  call: AdmitCall,
): Draft | null {
  const via = call.via ?? 'direct';
  if (via === 'direct') return null;
  const parent =
    ctx.catalogue.status === 'verified' && call.parent_tool !== undefined
      ? ctx.catalogue.tools.get(call.parent_tool)
      : undefined;
  if (!parent || !parent.reaches_tools.some((p) => toolMatch(p, def.id))) {
    return deny('not_reachable', 'capability');
  }
  return null;
}

function callRules(ctx: AdmitContext, def: ToolDefinition, call: AdmitCall): Draft {
  if (def.id !== SHELL_TOOL_ID) {
    const action = toolAction(def.id);
    if (PATH_TOOLS.has(action)) {
      const resources = pathResources(action, call.input);
      if (resources === null) return deny('invalid_resource', 'rule');
      let worst: Draft | null = null;
      for (const r of resources) {
        const d = outcomeDraft(evaluateToolRules(ctx.grant, action, r, ctx.cwd));
        worst = worst === null ? d : raise(worst, d);
      }
      return worst ?? deny('invalid_resource', 'rule');
    }
    return outcomeDraft(
      evaluateToolRules(ctx.grant, action, resourceOf(def, call), ctx.cwd),
    );
  }
  const command = call.input?.['command'];
  if (typeof command !== 'string') return deny('untokenizable', 'rule');
  const dialect = /^(powershell|pwsh)$/i.test(call.native ?? '') ? 'powershell' : 'bash';
  const tokens = tokenizeShell(command, dialect);
  if (!tokens.ok) return deny(tokens.error, 'rule');
  return outcomeDraft(evaluateShell(ctx.grant, tokens.value, dialect, ctx.cwd));
}

function outcomeDraft(o: {
  effect: Effect;
  reason: ReasonCode;
  rule: string | null;
}): Draft {
  return {
    decision: o.effect,
    reason: o.reason,
    layer: o.reason === 'managed_deny' ? 'floor' : 'rule',
    rule: o.rule,
    findings: [],
  };
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
  if (ctx.lane !== ctx.grant.lane) return no(deny('inspector_error', 'floor'));
  if (ctx.catalogue.status !== 'verified') return no(deny('quarantined', 'floor'));
  const def = ctx.catalogue.tools.get(call.tool);
  if (!def) return no(deny('unknown_tool', 'capability'));

  const support = def.support[ctx.harness] ?? def.support['*'];
  if (!support) return no(deny('unsupported_harness', 'capability'));
  const enf = support.enforced;
  const via = call.via ?? 'direct';

  if (def.exposure === 'hidden' || (def.exposure === 'codemode' && via !== 'codemode')) {
    return no(deny('exposure', 'capability'), enf);
  }
  if (!schemaMatches(def, ctx.liveSchemaHashes))
    return no(deny('schema_changed', 'floor'), enf);
  if (
    ctx.grant.lane === 'full' &&
    (def.risk === 'network' || def.risk === 'credential') &&
    enf !== 'os' &&
    enf !== 'server'
  ) {
    return no(deny('enforcement_insufficient', 'capability'), enf);
  }
  const gv = checkToolGranted(ctx.grant, def.id);
  if (!gv.granted) return no(deny('not_granted', 'capability', gv.rule), enf);
  const reach = checkReach(ctx, def, call);
  if (reach) return no(reach, enf);

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
  if (draft.decision !== 'deny') {
    for (const inspect of ctx.inspectors ?? []) {
      let r: InspectorResult;
      try {
        r = inspect(ctx, call);
      } catch {
        return no(deny('inspector_error', 'inspector'), enf);
      }
      if (!Object.hasOwn(SEVERITY, r.effect))
        return no(deny('inspector_error', 'inspector'), enf);
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
    if (b.verdict === 'deny') draft = raise(draft, deny('budget_exceeded', 'rule'));
    else if (b.verdict === 'ask') {
      draft = raise(draft, {
        decision: 'ask',
        reason: 'budget_soft_limit',
        layer: 'rule',
        rule: null,
        findings: [],
      });
    }
  }
  return no(draft, enf);
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
  if (ctx.catalogue.status !== 'verified') return [];
  const out: { id: string; exposure: ToolDefinition['exposure'] }[] = [];
  for (const def of ctx.catalogue.tools.values()) {
    if (admit(ctx, { phase: 'list', tool: def.id }).decision === 'allow') {
      out.push({ id: def.id, exposure: def.exposure });
    }
  }
  return out;
}

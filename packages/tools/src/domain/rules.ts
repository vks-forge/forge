/**
 * Call-time rule evaluation — turns `{action, resource}` into allow, ask or deny.
 *
 * Why: seeing a tool is not permission to do everything with it. A Worker may run
 *   `pnpm test` but not `git push`, edit `src/` but not `migrations/`, and a shell line
 *   like `pnpm test && git push` must be judged by its worst command. Within one layer
 *   the last matching rule wins (shell: the longest literal prefix wins, so a narrow rule
 *   beats a broad one). Layers then combine by severity, so a project or ticket rule can
 *   only make a call stricter than the lane. The managed deny layer is checked first and
 *   nothing overrides it. A call no lane rule mentions is an `ask`, never an allow
 *   (tool-system.md §5.2).
 *
 * Exports: evaluateToolRules(), evaluateShell(), normalizePath() (re-exported).
 * Depends on: @forge/core (globMatch), schemas/grant, shared/pattern, types/grants, types/rules,
 *   types/tokenizer. No IO.
 */

import { globMatch } from '@forge/core';
import type { CallRule, Effect } from '#/schemas/grant.js';
import { floorViolation } from '#/domain/floor-argv.js';
import { normalizePath } from '#/shared/path.js';
import { commandMatch, literalPrefixLength, toolMatch } from '#/shared/pattern.js';
import type { EffectiveGrant } from '#/types/grants.types.js';
import type { MatchMode, RuleOutcome } from '#/types/rules.types.js';
import type { ShellDialect, ShellSegment } from '#/types/tokenizer.types.js';

export { normalizePath };

const PATH_ACTIONS = new Set(['read', 'edit', 'write', 'grep', 'glob']);
const SEVERITY: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };
const NULL_DEVICES = new Set(['/dev/null', '$null', 'nul']);
const REASON = { allow: 'rule_allow', ask: 'rule_ask', deny: 'rule_deny' } as const;

function matches(
  pattern: string,
  text: string,
  mode: MatchMode,
  ignoreCase: boolean,
): boolean {
  if (mode === 'shell') return commandMatch(pattern, text, ignoreCase);
  if (mode === 'path') return globMatch(pattern, text);
  return toolMatch(pattern, text);
}

/** Last match wins; for shell the longest literal prefix wins, ties going to the later rule. */
function pick(
  rules: readonly CallRule[],
  action: string,
  resource: string,
  mode: MatchMode,
  ignoreCase: boolean,
): { rule: CallRule; index: number } | null {
  let best: { rule: CallRule; index: number; len: number } | null = null;
  for (const [index, rule] of rules.entries()) {
    if (rule.action !== action || !matches(rule.resource, resource, mode, ignoreCase))
      continue;
    const len = mode === 'shell' ? literalPrefixLength(rule.resource) : 0;
    if (best === null || len >= best.len) best = { rule, index, len };
  }
  return best;
}

const idOf = (layer: string, hit: { rule: CallRule; index: number }): string =>
  hit.rule.id ?? `${layer}#${hit.index}`;

function worse(a: RuleOutcome | null, b: RuleOutcome): RuleOutcome {
  return a === null || SEVERITY[b.effect] > SEVERITY[a.effect] ? b : a;
}

function evaluate(
  grant: EffectiveGrant,
  action: string,
  resource: string,
  mode: MatchMode,
  ignoreCase: boolean,
): RuleOutcome {
  const denyHit = pick(
    grant.managed.filter((r) => r.effect === 'deny'),
    action,
    resource,
    mode,
    ignoreCase,
  );
  if (denyHit)
    return { effect: 'deny', reason: 'managed_deny', rule: idOf('managed', denyHit) };

  let out: RuleOutcome | null = null;
  for (const [i, layer] of grant.ruleLayers.entries()) {
    const hit = pick(layer.rules, action, resource, mode, ignoreCase);
    if (hit) {
      const effect = hit.rule.effect;
      out = worse(out, { effect, reason: REASON[effect], rule: idOf(layer.name, hit) });
    } else if (i === 0) {
      // The lane layer is the baseline: silence there means "ask", whatever later layers say.
      out = worse(out, { effect: 'ask', reason: 'no_matching_rule', rule: null });
    }
  }
  return out ?? { effect: 'ask', reason: 'no_matching_rule', rule: null };
}

/** Evaluates a non-shell tool call (`edit` on a path, `web_fetch` on a URL, ...). */
export function evaluateToolRules(
  grant: EffectiveGrant,
  action: string,
  resource: string,
  cwd?: string,
): RuleOutcome {
  const isPath = PATH_ACTIONS.has(action);
  const res = isPath ? normalizePath(resource, cwd) : resource;
  return evaluate(grant, action, res, isPath ? 'path' : 'plain', false);
}

function evaluateSegment(
  grant: EffectiveGrant,
  seg: ShellSegment,
  dialect: ShellDialect,
  cwd?: string,
): RuleOutcome {
  const ic = dialect === 'powershell';
  const floor = floorViolation(seg, cwd);
  if (floor !== null) return { effect: 'deny', reason: 'managed_deny', rule: floor };
  let out = evaluate(grant, 'shell', seg.text, 'shell', ic);
  if (seg.baseText !== seg.text) {
    // A path-qualified or `.exe` spelling must not dodge a deny or ask; it can never gain an allow.
    const alt = evaluate(grant, 'shell', seg.baseText, 'shell', ic);
    if (alt.rule !== null && alt.effect !== 'allow') out = worse(out, alt);
  }
  for (const rd of seg.redirects) {
    if (NULL_DEVICES.has(rd.target.toLowerCase())) continue;
    out = worse(out, evaluateToolRules(grant, rd.mode, rd.target, cwd));
  }
  if (seg.flags.length > 0) {
    out = worse(out, { effect: 'ask', reason: 'risky_shell_construct', rule: null });
  }
  return out;
}

/** Evaluates every segment of a tokenized shell line; the chain is as strict as its worst segment. */
export function evaluateShell(
  grant: EffectiveGrant,
  segments: readonly ShellSegment[],
  dialect: ShellDialect,
  cwd?: string,
): RuleOutcome {
  let out: RuleOutcome | null = null;
  for (const seg of segments) out = worse(out, evaluateSegment(grant, seg, dialect, cwd));
  return out ?? { effect: 'deny', reason: 'untokenizable', rule: null };
}

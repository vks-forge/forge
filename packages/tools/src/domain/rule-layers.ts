/**
 * Rule layers — picks the matching rule in each layer and combines layers by severity.
 *
 * Why: the lane, project, ticket and managed rule lists each answer "allow, ask or deny"
 *   for one resource, and the verdict must be the strictest of them: a project or ticket
 *   rule can narrow a lane but never widen it, and a managed deny beats everything. Keeping
 *   this apart from the shell and path walkers means one place decides what "stricter"
 *   means (tool-system.md §5.2).
 *
 * Exports: evaluate(), worse().
 * Depends on: @forge/core (globMatch), schemas/grant, shared/path, shared/pattern, types/grants, types/rules. No IO.
 */

import { globMatch } from '@forge/core';
import type { CallRule, Effect } from '#/schemas/grant.js';
import { commandMatch, literalPrefixLength, toolMatch } from '#/shared/pattern.js';
import type { EffectiveGrant } from '#/types/grants.types.js';
import { absolutePath } from '#/shared/path.js';
import type { MatchMode, RuleOutcome, SegmentShape } from '#/types/rules.types.js';

const SEVERITY: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };
const REASON = { allow: 'rule_allow', ask: 'rule_ask', deny: 'rule_deny' } as const;

function matches(
  pattern: string,
  text: string,
  mode: MatchMode,
  ignoreCase: boolean,
): boolean {
  if (mode === 'shell') {
    return commandMatch(pattern, text, ignoreCase);
  }

  // Both sides are case-folded: the Windows filesystem ignores case (see shared/path.ts).
  if (mode === 'path') {
    return globMatch(pattern.toLowerCase(), text.toLowerCase());
  }

  return toolMatch(pattern, text);
}

/** A `strict` rule applies only to a bare segment run from its own directory (Windows paths fold case). */
function strictApplies(rule: CallRule, shape: SegmentShape | undefined): boolean {
  if (rule.strict === undefined) {
    return true;
  }

  return (
    shape !== undefined &&
    shape.clean &&
    shape.cwd !== undefined &&
    absolutePath(shape.cwd).toLowerCase() === absolutePath(rule.strict.cwd).toLowerCase()
  );
}

/** Last match wins; for shell the longest literal prefix wins, ties going to the later rule. */
function pick(
  rules: readonly CallRule[],
  action: string,
  resource: string,
  mode: MatchMode,
  ignoreCase: boolean,
  shape?: SegmentShape,
): { rule: CallRule; index: number } | null {
  let best: { rule: CallRule; index: number; len: number } | null = null;
  for (const [index, rule] of rules.entries()) {
    if (
      rule.action !== action ||
      !strictApplies(rule, shape) ||
      !matches(rule.resource, resource, mode, ignoreCase)
    ) {
      continue;
    }

    const len = mode === 'shell' ? literalPrefixLength(rule.resource) : 0;
    if (best === null || len >= best.len) {
      best = { rule, index, len };
    }
  }

  return best;
}

const idOf = (layer: string, hit: { rule: CallRule; index: number }): string =>
  hit.rule.id ?? `${layer}#${hit.index}`;

export function worse(a: RuleOutcome | null, b: RuleOutcome): RuleOutcome {
  return a === null || SEVERITY[b.effect] > SEVERITY[a.effect] ? b : a;
}

export function evaluate(
  grant: EffectiveGrant,
  action: string,
  resource: string,
  mode: MatchMode,
  ignoreCase: boolean,
  shape?: SegmentShape,
): RuleOutcome {
  const denyHit = pick(
    grant.managed.filter((r) => r.effect === 'deny'),
    action,
    resource,
    mode,
    ignoreCase,
  );

  if (denyHit) {
    return { effect: 'deny', reason: 'managed_deny', rule: idOf('managed', denyHit) };
  }

  let out: RuleOutcome | null = null;
  for (const [i, layer] of grant.ruleLayers.entries()) {
    const hit = pick(layer.rules, action, resource, mode, ignoreCase, shape);
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

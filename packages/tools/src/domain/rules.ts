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
 *   Path matching is case-insensitive on both sides (Windows filesystem), the path is
 *   normalised on its absolute form before it is made relative to the cwd, and an empty path
 *   is a denial, not "the cwd". Shell segments are also judged for the files their argv
 *   reads or writes (`cat .env`, `git diff --output=f`) and for the commands nested in
 *   `bash -c`, `cmd /c`, `powershell -Command` and `eval`: a floor hit anywhere inside is a
 *   deny, not just an ask. Every path, from a tool or an argv, also passes the data-home floor.
 *
 * Exports: evaluateToolRules(), evaluateShell(), normalizePath() (re-exported).
 * Depends on: @forge/core (globMatch), domain/argv-paths, domain/cd-cwd, domain/command-candidates,
 *   domain/data-home-floor, domain/floor-argv, domain/nested-scripts, domain/tokenizer, schemas/grant, shared/path,
 *   shared/pattern, types/grants, types/rules, types/tokenizer. No IO.
 */

import { globMatch } from '@forge/core';
import type { CallRule, Effect } from '#/schemas/grant.js';
import { argvReads, argvWrites, wildcardHitsFloor } from '#/domain/argv-paths.js';
import { commandCandidates, commandName } from '#/domain/command-candidates.js';
import { isCdToCwd } from '#/domain/cd-cwd.js';
import { dataHomeGuard, dataHomeOutcome } from '#/domain/data-home-floor.js';
import { floorViolation } from '#/domain/floor-argv.js';
import { looseFloorHit, nestedScripts } from '#/domain/nested-scripts.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import { normalizePath } from '#/shared/path.js';
import { commandMatch, literalPrefixLength, toolMatch } from '#/shared/pattern.js';
import type { EffectiveGrant } from '#/types/grants.types.js';
import type { MatchMode, RuleOutcome } from '#/types/rules.types.js';
import type { ShellDialect, ShellSegment } from '#/types/tokenizer.types.js';

export { normalizePath };

const PATH_ACTIONS = new Set(['read', 'edit', 'write', 'grep', 'glob']);
const SEVERITY: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };
const MAX_NESTING = 4;
const NULL_DEVICES = new Set(['/dev/null', '$null', 'nul']);
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
    if (rule.action !== action || !matches(rule.resource, resource, mode, ignoreCase)) {
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

  if (denyHit) {
    return { effect: 'deny', reason: 'managed_deny', rule: idOf('managed', denyHit) };
  }

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

const INVALID: RuleOutcome = { effect: 'deny', reason: 'invalid_resource', rule: null };

/** Control characters and NUL are never part of a path a tool should open. */
const hasControl = (s: string): boolean => /[\u0000-\u001f\u007f]/.test(s);

/** Evaluates a non-shell tool call (`edit` on a path, `web_fetch` on a URL, ...). */
export function evaluateToolRules(
  grant: EffectiveGrant,
  action: string,
  resource: string,
  cwd?: string,
): RuleOutcome {
  const isPath = PATH_ACTIONS.has(action);
  if (
    isPath &&
    (typeof resource !== 'string' || resource.trim() === '' || hasControl(resource))
  ) {
    return INVALID;
  }

  if (isPath) {
    const home = dataHomeOutcome(grant.dataHome, resource, cwd);
    if (home !== null) {
      return home;
    }
  }

  const res = isPath ? normalizePath(resource, cwd) : resource;

  return evaluate(grant, action, res, isPath ? 'path' : 'plain', false);
}

const FLOOR_GLOB: RuleOutcome = {
  effect: 'deny',
  reason: 'managed_deny',
  rule: 'floor:argv:wildcard-path',
};

/** Judges the files an argv reads or writes, and what it runs through eval or a wrapper. */
function evaluateArgv(
  grant: EffectiveGrant,
  seg: ShellSegment,
  cwd: string | undefined,
  depth: number,
): RuleOutcome | null {
  let out: RuleOutcome | null = null;
  for (const argv of commandCandidates(seg.argv)) {
    const cmd = commandName(argv[0]);
    const rest = argv.slice(1);
    for (const p of argvReads(cmd, rest)) {
      out = worse(
        out,
        wildcardHitsFloor(p) ? FLOOR_GLOB : evaluateToolRules(grant, 'read', p, cwd),
      );
    }

    for (const p of argvWrites(cmd, rest)) {
      out = worse(out, evaluateToolRules(grant, 'write', p, cwd));
    }

    for (const nested of nestedScripts(cmd, rest)) {
      const inner = evaluateNested(grant, nested, cwd, depth + 1);
      if (inner !== null) {
        out = worse(out, inner);
      }
    }
  }

  return out;
}

/** Only a managed deny from inside a nested script is returned; the eval flag already asks. */
function evaluateNested(
  grant: EffectiveGrant,
  nested: { text: string; dialect: ShellDialect | null },
  cwd: string | undefined,
  depth: number,
): RuleOutcome | null {
  const tokens =
    nested.dialect === null ? null : tokenizeShell(nested.text, nested.dialect);

  if (tokens === null || !tokens.ok) {
    const hit = looseFloorHit(nested.text);

    return hit === null ? null : { effect: 'deny', reason: 'managed_deny', rule: hit };
  }

  if (depth > MAX_NESTING) {
    return { effect: 'deny', reason: 'managed_deny', rule: 'floor:argv:nesting' };
  }

  let out: RuleOutcome | null = null;
  for (const seg of tokens.value) {
    const r = evaluateSegment(grant, seg, nested.dialect as ShellDialect, cwd, depth);
    if (r.effect === 'deny' && r.reason === 'managed_deny') {
      out = worse(out, r);
    }
  }

  return out;
}

function evaluateSegment(
  grant: EffectiveGrant,
  seg: ShellSegment,
  dialect: ShellDialect,
  cwd?: string,
  depth = 0,
): RuleOutcome {
  const ic = dialect === 'powershell';
  const floor = dataHomeGuard(grant.dataHome) ?? floorViolation(seg, cwd);
  if (floor !== null) {
    return { effect: 'deny', reason: 'managed_deny', rule: floor };
  }

  let out = evaluate(grant, 'shell', seg.text, 'shell', ic);
  if (seg.baseText !== seg.text) {
    // A path-qualified or `.exe` spelling must not dodge a deny or ask; it can never gain an allow.
    const alt = evaluate(grant, 'shell', seg.baseText, 'shell', ic);
    if (alt.rule !== null && alt.effect !== 'allow') {
      out = worse(out, alt);
    }
  }

  for (const rd of seg.redirects) {
    if (NULL_DEVICES.has(rd.target.toLowerCase())) {
      continue;
    }

    out = worse(out, evaluateToolRules(grant, rd.mode, rd.target, cwd));
  }

  const argv = evaluateArgv(grant, seg, cwd, depth);
  if (argv !== null) {
    out = worse(out, argv);
  }

  // `cd` into the directory the run is already in moves nothing; only the silent `ask` is lifted.
  if (
    out.effect === 'ask' &&
    out.reason === 'no_matching_rule' &&
    isCdToCwd(seg, dialect, cwd)
  ) {
    return { effect: 'allow', reason: 'rule_allow', rule: 'builtin:cd-cwd' };
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
  for (const seg of segments) {
    out = worse(out, evaluateSegment(grant, seg, dialect, cwd));
  }

  return out ?? { effect: 'deny', reason: 'untokenizable', rule: null };
}

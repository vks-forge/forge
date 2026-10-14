/**
 * Grant building — lane defaults narrowed by project and ticket grants, deny always wins.
 *
 * Why: which tools a Worker sees is a security decision that several parties touch: the
 *   lane sets a ceiling, the project may restrict it (or name the project-gated tools it
 *   wants), the ticket may restrict further, and the operator's managed rules sit on
 *   top. The result must be the intersection, never the union, with every `deny`
 *   beating every `allow`, or one over-generous file widens a run. Rules that would let
 *   a remembered approval cover `bash -c`, `python -c`, `node -e` or a bare `git` are
 *   refused at build time, because "always allow" on an interpreter is "always allow
 *   anything" (tool-system.md §5.1, §5.2, §13).
 *
 * Exports: effectiveGrant(), checkToolGranted(), assertNotBannedAlwaysAllow(), assertValidRules(),
 *   parseGrant().
 * Depends on: @forge/core (Lane), domain/command-classes, domain/lane-defaults, domain/floors, domain/tool-id,
 *   schemas/grant, shared/errors, shared/pattern. No IO.
 */

import type { Lane } from '@forge/core';
import { ALWAYS_ASK_COMMANDS } from '#/domain/command-classes.js';
import { FLOOR_RULES } from '#/domain/floors.js';
import { LANE_DEFAULTS } from '#/domain/lane-defaults.js';
import { isProjectMcp } from '#/domain/tool-id.js';
import { Grant } from '#/schemas/grant.js';
import type { CallRule } from '#/schemas/grant.js';
import { BannedAlwaysAllowError, InvalidGrantError } from '#/shared/errors.js';
import { toolMatch } from '#/shared/pattern.js';
import type {
  EffectiveGrant,
  FloorInputs,
  GrantVerdict,
  RuleLayer,
} from '#/types/grants.types.js';

/** Collapses an allow resource to its command words, e.g. `Bash -c *` to `bash -c`. */
function core(resource: string): string {
  return resource
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s*]+$/, '')
    .trim();
}

/**
 * Throws when an `allow` shell rule would permanently permit an interpreter, a wrapper, a
 * bare `git`, or any command via a leading wildcard. Narrow forms like `git status*` pass.
 */
export function assertNotBannedAlwaysAllow(rule: CallRule): void {
  if (rule.effect !== 'allow' || rule.action !== 'shell') {
    return;
  }

  const c = core(rule.resource);
  const first = c.split(' ')[0] ?? '';
  const banned =
    c === '' ||
    /[*?]/.test(first) ||
    c === 'git' ||
    ALWAYS_ASK_COMMANDS.some((p) => c === p || c.startsWith(`${p} `));

  if (banned) {
    throw new BannedAlwaysAllowError(`${rule.action} ${rule.resource}`);
  }
}

/** Validates a rule list; `denyOnly` is used for the managed layer, which may never allow or ask. */
export function assertValidRules(rules: readonly CallRule[], denyOnly = false): void {
  for (const r of rules) {
    if (denyOnly && r.effect !== 'deny') {
      throw new InvalidGrantError(
        `managed rules may only deny: ${r.action} ${r.resource}`,
      );
    }

    assertNotBannedAlwaysAllow(r);
  }
}

/** Parses an untrusted grant (yaml object); schema failure becomes a typed error. */
export function parseGrant(input: unknown): Grant {
  const r = Grant.safeParse(input);
  if (!r.success) {
    throw new InvalidGrantError(`invalid grant: ${r.error.message}`);
  }

  assertValidRules(r.data.rules);

  return r.data;
}

/**
 * Merges lane defaults with the project and ticket grants. Narrowing only: `allow` lists
 * intersect, `deny` lists union, rule layers are kept separate and combined by severity
 * at evaluation. `managed` adds operator deny-only rules after the built-in floors.
 * `floors.dataHome` names the folder the data-home floor protects; omitted, every path is
 * denied (fail closed).
 */
export function effectiveGrant(
  lane: Lane,
  projectGrant?: Grant,
  ticketGrant?: Grant,
  managed: readonly CallRule[] = [],
  floors?: FloorInputs,
): EffectiveGrant {
  const defaults = LANE_DEFAULTS[lane];
  const layers = [projectGrant, ticketGrant];
  assertValidRules(defaults.rules);
  assertValidRules(managed, true);
  for (const g of layers) {
    if (g) {
      assertValidRules(g.rules);
    }
  }

  const projectAllow = projectGrant?.allow ?? [];
  const named = defaults.projectGated.filter((t) => projectAllow.includes(t));
  const ruleLayers: RuleLayer[] = [
    { name: `lane:${lane}`, rules: defaults.rules },
    { name: 'project', rules: projectGrant?.rules ?? [] },
    { name: 'ticket', rules: ticketGrant?.rules ?? [] },
  ];

  return {
    lane,
    dataHome: floors?.dataHome ?? '',
    ceiling: [...defaults.allow, ...named],
    projectMcpAllow: projectAllow.filter((p) => p !== '*'),
    projectMcps: defaults.projectMcps,
    narrowing: layers.flatMap((g) => (g?.allow ? [g.allow] : [])),
    deny: [...defaults.deny, ...layers.flatMap((g) => g?.deny ?? [])],
    ruleLayers,
    managed: [...FLOOR_RULES, ...managed],
  };
}

/** Capability gate: is `toolId` visible under `grant`? Deny wins over every allow. */
export function checkToolGranted(grant: EffectiveGrant, toolId: string): GrantVerdict {
  const denied = grant.deny.find((d) => toolMatch(d, toolId));
  if (denied !== undefined) {
    return { granted: false, rule: `grant:deny:${denied}` };
  }

  const inCeiling = isProjectMcp(toolId)
    ? grant.projectMcps && grant.projectMcpAllow.some((p) => toolMatch(p, toolId))
    : grant.ceiling.some((p) => toolMatch(p, toolId));

  if (!inCeiling) {
    return { granted: false, rule: 'grant:ceiling' };
  }

  const miss = grant.narrowing.findIndex(
    (layer) => !layer.some((p) => toolMatch(p, toolId)),
  );

  if (miss !== -1) {
    return { granted: false, rule: `grant:narrow:${miss}` };
  }

  return { granted: true, rule: null };
}

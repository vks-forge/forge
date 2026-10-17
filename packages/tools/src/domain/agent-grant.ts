/**
 * Agent grant — the narrowing layer an agent's tools and write scope add to a run.
 *
 * Why: an agent promises the owner what it may use ("only read and edit") and where it may
 *   write ("only test files"). That promise is kept here, in policy, by turning the agent's
 *   definition into one more grant layer: its tool list intersects with the lane and project
 *   (a tool the agent does not list is invisible to the run), and its write scope becomes
 *   path rules that deny every `edit` and `write` outside it. The layer can only tighten:
 *   rule layers combine by severity, so a scope that names a protected path does not unlock
 *   it, and an empty scope denies all writes (fail closed). The Forge tools a run cannot end
 *   without (finish, ask, report) stay visible whatever the agent lists, or a narrowed run
 *   could never complete.
 *
 * Exports: agentGrant(), RUN_CORE_TOOLS.
 * Depends on: schemas/grant, types/agent-grant. No IO.
 */

import { Grant } from '#/schemas/grant.js';
import type { CallRule } from '#/schemas/grant.js';
import type { AgentGrantInput } from '#/types/agent-grant.types.js';

/** Forge tools every run needs to ask, report and end, whatever else the agent lists. */
export const RUN_CORE_TOOLS: readonly string[] = [
  'mcp__forge__get_ticket',
  'mcp__forge__add_comment',
  'mcp__forge__ask_director',
  'mcp__forge__report_blocked',
  'mcp__forge__finish',
];

/** Tools that change files by path; their calls are judged against the write scope. */
const PATH_WRITE_ACTIONS = ['edit', 'write'] as const;

const wholeWorktree = (scope: readonly string[]): boolean =>
  scope.length === 1 && scope[0] === '**';

/** Deny every path, then allow the scope's globs; the last matching rule in a layer wins. */
function scopeRules(scope: readonly string[]): CallRule[] {
  return PATH_WRITE_ACTIONS.flatMap((action) => [
    { action, resource: '**', effect: 'deny' as const },
    ...scope.map((glob) => ({ action, resource: glob, effect: 'allow' as const })),
  ]);
}

/**
 * The grant layer for `def`, or undefined when the agent adds no restriction (lane-default
 * tools and the whole worktree), so a run without a narrowing agent is judged exactly as before.
 */
export function agentGrant(def: AgentGrantInput): Grant | undefined {
  const laneTools = def.tools === 'lane_default';
  if (laneTools && wholeWorktree(def.write_scope)) {
    return undefined;
  }

  return Grant.parse({
    ...(laneTools ? {} : { allow: [...new Set([...def.tools, ...RUN_CORE_TOOLS])] }),
    deny: [],
    rules: wholeWorktree(def.write_scope) ? [] : scopeRules(def.write_scope),
  });
}

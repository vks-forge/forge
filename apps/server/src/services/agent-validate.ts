/**
 * Checks an agent definition before it is saved or returned from a draft.
 *
 * Why: the schema can say a definition is well formed, but three questions need the server: do
 *   the tool ids exist in this install's catalogue (the catalogue is data in the database, not
 *   core), does the role allow what the definition asks for, and is the name free. Each
 *   failure has its own code and lists the fields so the editor can put the message next to
 *   the control. Nothing is saved from a definition that fails here, whoever wrote it.
 *
 * Exports: assertRoleBounds(), assertKnownTools(), assertForgeDefault(), idForName(), assertFreeName(),
 *   issuesOf().
 * Depends on: @forge/core (agentRuleIssues, slugifyAgentName), services/http/http-errors. No IO.
 */

import { agentRuleIssues, forgeDefaultIssues, slugifyAgentName } from '@forge/core';
import type { AgentInput, AgentView } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';

/** The rule issues of `def` in the error shape the API returns. */
export function issuesOf(def: AgentInput): { path: string; message: string }[] {
  return agentRuleIssues(def).map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
}

/** 400 `role_bounds` when the role does not allow the tools, scope or fallbacks. */
export function assertRoleBounds(def: AgentInput): void {
  const issues = issuesOf(def);
  if (issues.length > 0) {
    throw new HttpError(400, 'role_bounds', issues[0]?.message ?? 'role bounds broken', {
      issues,
    });
  }
}

/** 400 `unknown_tool` naming every tool id missing from the catalogue. */
export function assertKnownTools(def: AgentInput, catalogueIds: readonly string[]): void {
  if (def.tools === 'lane_default') {
    return;
  }

  const unknown = def.tools.filter((t) => !catalogueIds.includes(t));
  if (unknown.length > 0) {
    throw new HttpError(
      400,
      'unknown_tool',
      `these tools are not in the catalogue: ${unknown.join(', ')}`,
      { issues: unknown.map((t) => ({ path: 'tools', message: `unknown tool ${t}` })) },
    );
  }
}

/** 400 `forge_default_not_allowed` unless the agent is the built-in implementer. */
export function assertForgeDefault(id: string, def: AgentInput): void {
  const issues = forgeDefaultIssues(id, def);
  if (issues.length > 0) {
    throw new HttpError(400, 'forge_default_not_allowed', issues[0] ?? 'not allowed', {
      issues: [{ path: 'runs_on.model', message: issues[0] ?? 'not allowed' }],
    });
  }
}

/** The id a display name makes; 400 `invalid_name` when nothing usable remains. */
export function idForName(name: string): string {
  const id = slugifyAgentName(name);
  if (id === null) {
    throw new HttpError(
      400,
      'invalid_name',
      'the name needs at least two letters or digits, starting with a letter',
    );
  }

  return id;
}

/** 409 `name_taken` when another visible agent has this id or this name (any case). */
export function assertFreeName(
  views: readonly AgentView[],
  id: string,
  name: string,
  exceptId?: string,
): void {
  const taken = views.find(
    (v) =>
      v.id !== exceptId &&
      (v.id === id || v.definition.name.toLowerCase() === name.toLowerCase()),
  );

  if (taken) {
    throw new HttpError(
      409,
      'name_taken',
      `another agent already uses the name "${taken.definition.name}"`,
    );
  }
}

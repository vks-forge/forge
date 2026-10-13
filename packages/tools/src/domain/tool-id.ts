/**
 * Tool id helpers — what rule-action a catalogue id maps to.
 *
 * Why: call-time rules are written against short actions (`shell`, `edit`, `web_fetch`)
 *   while the catalogue and the harness speak in ids (`mcp__forge__web_fetch`). One
 *   mapping, used by both the grant builder and the rule evaluator, means a rule written
 *   for `web_fetch` always binds the tool the catalogue calls that, and project MCP
 *   servers (which the operator did not name in advance) fall under one `project_mcp`
 *   action instead of silently matching nothing (tool-system.md §4, §8).
 *
 * Exports: SHELL_TOOL_ID, FACTORY_SERVER, isProjectMcp(), toolAction(), nativeNames().
 * Depends on: schemas/tool-definition (type only). No IO.
 */

import type { HarnessSupport } from '#/schemas/tool-definition.js';

/** Canonical id of the harness shell tool (Bash on POSIX, PowerShell on Windows; d-0048). */
export const SHELL_TOOL_ID = 'shell';

/** MCP server name of the Factory's own tools. */
export const FACTORY_SERVER = 'forge';

const MCP = /^mcp__([a-z0-9-]+)__([a-z0-9_-]+)$/;

/** True for an MCP tool served by a project-declared server rather than the Factory. */
export function isProjectMcp(toolId: string): boolean {
  const m = MCP.exec(toolId);
  return m !== null && m[1] !== FACTORY_SERVER;
}

/** Rule action for a tool id: the bare tool name; `project_mcp` for project servers' tools. */
export function toolAction(toolId: string): string {
  const m = MCP.exec(toolId);
  if (!m) return toolId;
  return m[1] === FACTORY_SERVER ? (m[2] as string) : 'project_mcp';
}

/** Every harness-native name a support entry declares (`native` is one name or a list). */
export function nativeNames(support: HarnessSupport | undefined): readonly string[] {
  const native = support?.native;
  if (native === undefined) return [];
  return typeof native === 'string' ? [native] : native;
}

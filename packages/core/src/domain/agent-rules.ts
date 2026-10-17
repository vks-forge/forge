/**
 * Agent role bounds — what an agent of each role may be allowed to do.
 *
 * Why: a reviewer exists to judge work, and a judge that can also edit the thing it judges
 *   (or run a shell) is not independent. The bounds must hold however the definition was made
 *   (typed in, copied from a template, drafted by the Director), so they sit in one pure
 *   function the schema calls on every parse and the server calls before every save. A
 *   reviewer or researcher must name its tools explicitly (`lane_default` includes writes), may
 *   hold no write-class tool and no write scope; a writer or tester must say which paths it
 *   may change; fallbacks must be distinct so a quota chain cannot loop on one harness.
 *
 * Exports: WRITE_CLASS_TOOLS, isWriteClassTool(), agentRuleIssues(), forgeDefaultIssues(),
 *   agentHash(), agentCanonical().
 * Depends on: shared/sha256, shared/stable-json, types/agent-rules. No IO.
 */

import { sha256Hex } from '#/shared/sha256.js';
import { stableJson } from '#/shared/stable-json.js';
import type { AgentRuleInput, AgentRuleIssue } from '#/types/agent-rules.types.js';

/** Catalogue tools that change files or run code; `task` can reach all of them. */
export const WRITE_CLASS_TOOLS: readonly string[] = ['edit', 'write', 'shell', 'task'];

/** Forge's own tools run inside the Forge MCP server and carry this prefix. */
const FORGE_MCP_PREFIX = 'mcp__forge__';

/** True for a tool that can change files or run code, and for any project MCP tool (unknown reach, so treated as writing). */
export function isWriteClassTool(id: string): boolean {
  if (WRITE_CLASS_TOOLS.includes(id)) {
    return true;
  }

  return id.startsWith('mcp__') && !id.startsWith(FORGE_MCP_PREFIX);
}

/** Every broken role bound of `def`, empty when the definition is allowed. */
export function agentRuleIssues(def: AgentRuleInput): AgentRuleIssue[] {
  const issues: AgentRuleIssue[] = [];
  const readOnly = def.role === 'reviewer' || def.role === 'researcher';

  if (readOnly) {
    if (def.tools === 'lane_default') {
      issues.push({
        path: ['tools'],
        message: `a ${def.role} must list its tools; the lane default includes editing`,
      });
    } else {
      for (const t of def.tools.filter(isWriteClassTool)) {
        issues.push({
          path: ['tools'],
          message: `a ${def.role} cannot use the write tool "${t}"`,
        });
      }
    }

    if (def.write_scope.length > 0) {
      issues.push({
        path: ['write_scope'],
        message: `a ${def.role} cannot have a write scope`,
      });
    }
  } else if (def.write_scope.length === 0) {
    issues.push({
      path: ['write_scope'],
      message: `a ${def.role} needs a write scope (use ** for any path)`,
    });
  }

  const seen = new Set<string>();
  for (const [i, f] of def.runs_on.fallbacks.entries()) {
    const key = `${f.harness}|${f.model.kind}|${f.model.id ?? ''}`;
    if (seen.has(key)) {
      issues.push({
        path: ['runs_on', 'fallbacks', String(i)],
        message: 'fallbacks must be different from each other',
      });
    }

    seen.add(key);
    if (f.model.kind === 'forge_default') {
      issues.push({
        path: ['runs_on', 'fallbacks', String(i), 'model'],
        message: 'the Forge default model is only for the built-in implementer',
      });
    }
  }

  return issues;
}

/** `forge_default` follows the lane matrix, which only the built-in implementer may use; the messages say what is wrong. */
export function forgeDefaultIssues(id: string, def: AgentRuleInput): string[] {
  return def.runs_on.model.kind === 'forge_default' && id !== 'implementer'
    ? [`agent ${id} cannot use the Forge default model; only the implementer can`]
    : [];
}

/** Canonical JSON of a definition: keys sorted, so the same agent hashes the same however it was built. */
export function agentCanonical(def: unknown): string {
  return stableJson(def);
}

/** sha256 of the canonical JSON; a run records it to name exactly the definition it used. */
export function agentHash(def: unknown): string {
  return sha256Hex(agentCanonical(def));
}

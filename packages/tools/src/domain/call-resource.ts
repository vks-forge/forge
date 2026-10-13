/**
 * Call resource resolution — what a tool call touches, named once.
 *
 * Why: `admit()` judges a call against a resource (the file a path tool opens, the shell
 * line, the URL), and the receipt written for that call must name the same resource, or a
 * gate comparing the Worker's claim ("I edited src/a.ts", "I ran the tests") with the
 * receipts would be comparing against a different string than policy judged. This module
 * is that single resolver. `admit()` uses its path and shell helpers to decide; the hook
 * handler calls `callResource()` to fill `resource` on the decision receipt, so the two
 * cannot drift. Anything that cannot be named safely is `null`, never a guess
 * (tool-system.md §10, §12).
 *
 * Exports: callResource(), pathResources(), resourceOf(), shellDialect(), PATH_TOOLS.
 * Depends on: domain/tokenizer, domain/tool-id, shared/path, types/admit, schemas/tool-definition. No IO.
 */

import { tokenizeShell } from '#/domain/tokenizer.js';
import { SHELL_TOOL_ID, isProjectMcp, toolAction } from '#/domain/tool-id.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import { normalizePath } from '#/shared/path.js';
import type { AdmitCall, AdmitContext } from '#/types/admit.types.js';
import type { ShellDialect } from '#/types/tokenizer.types.js';

/** Fields a harness uses to name the file or directory of a path tool. */
const PATH_KEYS = ['file_path', 'path', 'notebook_path'] as const;
const RESOURCE_KEYS = ['url', 'query', 'name'];
/** Tool actions whose resource is a path. */
export const PATH_TOOLS = new Set(['read', 'edit', 'write', 'grep', 'glob']);
/** Receipts keep only this much of a shell line. */
const SHELL_RESOURCE_CHARS = 200;

/**
 * The resources a path tool touches, or `null` when the input does not name one safely.
 * Every present path field must be a string (a number or object in `path` is a bypass
 * attempt, not a path), and at least one must be non-empty. For `grep` the pattern stands
 * in for a missing path (it is judged as a path too, conservatively); for `glob` the
 * pattern is judged both alone and joined to `path`, so `../..` inside a pattern cannot
 * climb out.
 */
export function pathResources(
  action: string,
  input: AdmitCall['input'],
): string[] | null {
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

/** The plain string a non-path, non-shell tool is judged on (`url`, `query` or `name`; the id for a project MCP tool). */
export function resourceOf(def: ToolDefinition, call: AdmitCall): string {
  if (isProjectMcp(def.id)) return def.id;
  for (const k of RESOURCE_KEYS) {
    const v = call.input?.[k];
    if (typeof v === 'string') return v;
  }
  return '';
}

/** `PowerShell` selects the PowerShell tokenizer; every other native name is read as bash. */
export function shellDialect(native: string | undefined): ShellDialect {
  return /^(powershell|pwsh)$/i.test(native ?? '') ? 'powershell' : 'bash';
}

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The resource to record on the receipt for `call`: the normalised path (relative to the
 * cwd when inside it) for path tools; the first 200 characters of the normalised shell
 * segment texts, joined by ` ; `, for the shell; the host for a network tool given a URL;
 * the tool id for a project MCP tool or any other MCP tool. `null` when the call names
 * nothing safely (unknown tool, quarantined catalogue, bad path, untokenizable command).
 */
export function callResource(ctx: AdmitContext, call: AdmitCall): string | null {
  if (ctx.catalogue.status !== 'verified') return null;
  const def = ctx.catalogue.tools.get(call.tool);
  if (!def) return null;

  if (isProjectMcp(def.id)) return def.id;
  if (def.id === SHELL_TOOL_ID) {
    const command = call.input?.['command'];
    if (typeof command !== 'string') return null;
    const tokens = tokenizeShell(command, shellDialect(call.native));
    if (!tokens.ok) return null;
    return tokens.value
      .map((s) => s.text)
      .join(' ; ')
      .slice(0, SHELL_RESOURCE_CHARS);
  }
  const action = toolAction(def.id);
  if (PATH_TOOLS.has(action)) {
    const first = pathResources(action, call.input)?.[0];
    return first === undefined ? null : normalizePath(first, ctx.cwd);
  }
  if (def.risk === 'network') {
    const host = hostOf(call.input?.['url']);
    if (host !== null) return host;
  }
  return def.id.startsWith('mcp__') ? def.id : null;
}

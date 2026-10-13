/**
 * Maps a harness-native tool name to its catalogue id, and a result to an effect state.
 *
 * Why: the harness says `PowerShell` or `Bash`; policy, rules and receipts speak the
 *   catalogue id (`shell`). Resolving through the run's own signed catalogue, using the
 *   `support[harness].native` field (one name or a list), means one shell rule covers both names (d-0048:
 *   Windows CLI reports PowerShell, ACP reports Bash) and a tool the catalogue does not
 *   know stays under its raw name so `admit()` denies it as `unknown_tool` instead of
 *   being silently renamed into something allowed. The declared risk class also decides
 *   whether a finished call counts as a completed read or a committed mutation.
 *
 * Exports: resolveToolId(), toolDefinition(), effectStateFor().
 * Depends on: @forge/tools (nativeNames, AdmitContext, ToolDefinition, EffectState). No IO.
 */

import { nativeNames } from '@forge/tools';
import type { AdmitContext, EffectState, ToolDefinition } from '@forge/tools';

/** Catalogue id for `native` under `ctx`; MCP names are already ids; unknown names pass through. */
export function resolveToolId(ctx: AdmitContext, native: string): string {
  if (native.startsWith('mcp__')) return native;
  if (ctx.catalogue.status === 'verified') {
    for (const def of ctx.catalogue.tools.values()) {
      if (nativeNames(def.support[ctx.harness]).includes(native)) return def.id;
    }
  }
  return native;
}

export function toolDefinition(ctx: AdmitContext, toolId: string): ToolDefinition | null {
  return ctx.catalogue.status === 'verified'
    ? (ctx.catalogue.tools.get(toolId) ?? null)
    : null;
}

/**
 * Effect state after the harness reports the call. A failed read changed nothing; a
 * failed anything-else may have half-applied, so it is `uncertain` and triggers the
 * checkpoint diff (d-0033).
 */
export function effectStateFor(def: ToolDefinition | null, failed: boolean): EffectState {
  const read = def?.risk === 'read';
  if (failed) return read ? 'failed_no_effect' : 'uncertain';
  return read ? 'read_completed' : 'mutation_committed';
}

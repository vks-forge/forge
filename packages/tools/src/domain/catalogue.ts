/**
 * Catalogue loading, signature verification and schema-hash checks.
 *
 * Why: whether a tool exists for a run at all is decided by the catalogue, so it must be
 *   impossible for a Worker (or a stray edit in its worktree) to add or loosen a tool.
 *   The loader verifies an HMAC over the canonical entries before trusting a single
 *   field; failure quarantines the whole catalogue and every tool becomes unusable. A
 *   per-tool `schema_hash` catches the quieter attack: an MCP server that changes a
 *   tool's schema after review keeps its name but loses its trust (tool-system.md §4,
 *   §13, d-0038).
 *
 * Exports: loadCatalogue(), signCatalogue(), schemaMatches().
 * Depends on: yaml, schemas/catalogue, shared/canonical-json, shared/hmac, types/catalogue. No IO.
 */

import { parse } from 'yaml';
import { CatalogueFile } from '#/schemas/catalogue.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import { canonicalJson } from '#/shared/canonical-json.js';
import { hmacHex, safeEqualHex, sha256Hex } from '#/shared/hmac.js';
import type { CatalogueState } from '#/types/catalogue.types.js';

/** HMAC-SHA256 (hex) over the canonical `{entries}`; what a signer writes into `signature`. */
export function signCatalogue(entries: unknown, key: string | Uint8Array): string {
  return hmacHex(key, canonicalJson({ entries }));
}

/**
 * Parses catalogue yaml and verifies its signature with `key`. Anything but a valid,
 * signed, schema-conforming, duplicate-free catalogue yields `quarantined`.
 */
export function loadCatalogue(
  yamlText: string,
  key: string | Uint8Array,
): CatalogueState {
  let raw: unknown;
  try {
    raw = parse(yamlText);
  } catch {
    return { status: 'quarantined', reason: 'malformed' };
  }
  if (raw === null || typeof raw !== 'object')
    return { status: 'quarantined', reason: 'malformed' };
  const { entries, signature } = raw as { entries?: unknown; signature?: unknown };
  if (typeof signature !== 'string' || entries === undefined) {
    return { status: 'quarantined', reason: 'malformed' };
  }
  if (!safeEqualHex(signCatalogue(entries, key), signature)) {
    return { status: 'quarantined', reason: 'bad_signature' };
  }
  const parsed = CatalogueFile.safeParse(raw);
  if (!parsed.success) return { status: 'quarantined', reason: 'malformed' };
  const tools = new Map<string, ToolDefinition>();
  for (const def of parsed.data.entries) {
    if (tools.has(def.id)) return { status: 'quarantined', reason: 'malformed' };
    tools.set(def.id, def);
  }
  return {
    status: 'verified',
    tools,
    hash: sha256Hex(canonicalJson(parsed.data.entries)),
  };
}

/** True only when the harness reported a schema hash for `def` and it equals the catalogue's. */
export function schemaMatches(
  def: ToolDefinition,
  live: Readonly<Record<string, string>>,
): boolean {
  const reported = Object.hasOwn(live, def.id) ? live[def.id] : undefined;
  return reported !== undefined && reported === def.schema_hash;
}

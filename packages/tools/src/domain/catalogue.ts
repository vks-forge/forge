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
 *   The signing key is policy too: a key that is empty, shorter than 32 bytes or the public
 *   development key proves nothing (anyone can sign with it), so such a key quarantines the
 *   catalogue unless the caller explicitly allows the dev key for tests and local runs. Any
 *   failure while parsing or canonicalising hostile YAML (non-finite numbers, deep nesting,
 *   alias bombs) quarantines as `malformed`; the loader never throws.
 *
 * Exports: loadCatalogue(), signCatalogue(), schemaMatches(), devKeyAllowed(), DEV_CATALOGUE_KEY.
 * Depends on: yaml, schemas/catalogue, shared/canonical-json, shared/hmac, types/catalogue. No IO.
 */

import { parse } from 'yaml';
import { CatalogueFile } from '#/schemas/catalogue.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import { canonicalJson } from '#/shared/canonical-json.js';
import { MIN_KEY_BYTES, constantTimeEqual, hmacHex, sha256Hex } from '#/shared/hmac.js';
import type { CatalogueState, LoadOptions } from '#/types/catalogue.types.js';

/** INSECURE: public development key; a catalogue signed with it proves nothing. */
export const DEV_CATALOGUE_KEY = 'forge-dev-catalogue-key-INSECURE';

/**
 * Whether the process may load a dev-key catalogue: under test, or when the operator set
 * `FORGE_ALLOW_DEV_CATALOGUE_KEY=1`. Takes the environment as an argument (this package
 * reads no env var itself); production callers pass `process.env` and forward the result as
 * `allowDevKey`.
 */
export function devKeyAllowed(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env['NODE_ENV'] === 'test' || env['FORGE_ALLOW_DEV_CATALOGUE_KEY'] === '1';
}

const sameKey = (key: string | Uint8Array, text: string): boolean =>
  (typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key)).equals(
    Buffer.from(text, 'utf8'),
  );

function keyUsable(key: string | Uint8Array, opts: LoadOptions): boolean {
  const bytes = typeof key === 'string' ? Buffer.byteLength(key, 'utf8') : key.length;
  if (bytes < MIN_KEY_BYTES) {
    return false;
  }

  return opts.allowDevKey === true || !sameKey(key, DEV_CATALOGUE_KEY);
}

/** HMAC-SHA256 (hex) over the canonical `{entries}`; what a signer writes into `signature`. */
export function signCatalogue(entries: unknown, key: string | Uint8Array): string {
  return hmacHex(key, canonicalJson({ entries }));
}

const quarantine = (
  reason: 'malformed' | 'bad_signature' | 'bad_key',
): CatalogueState => ({ status: 'quarantined', reason });

/**
 * Parses catalogue yaml and verifies its signature with `key`. Anything but a valid,
 * signed, schema-conforming, duplicate-free catalogue yields `quarantined`. Never throws.
 */
export function loadCatalogue(
  yamlText: string,
  key: string | Uint8Array,
  opts: LoadOptions = {},
): CatalogueState {
  try {
    if (!keyUsable(key, opts)) {
      return quarantine('bad_key');
    }

    return verify(yamlText, key);
  } catch {
    return quarantine('malformed');
  }
}

function verify(yamlText: string, key: string | Uint8Array): CatalogueState {
  const raw: unknown = parse(yamlText);
  if (raw === null || typeof raw !== 'object') {
    return quarantine('malformed');
  }

  const { entries, signature } = raw as { entries?: unknown; signature?: unknown };
  if (typeof signature !== 'string' || entries === undefined) {
    return quarantine('malformed');
  }

  if (!constantTimeEqual(signCatalogue(entries, key), signature)) {
    return quarantine('bad_signature');
  }

  const parsed = CatalogueFile.safeParse(raw);
  if (!parsed.success) {
    return quarantine('malformed');
  }

  const tools = new Map<string, ToolDefinition>();
  for (const def of parsed.data.entries) {
    if (tools.has(def.id)) {
      return quarantine('malformed');
    }

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

/**
 * Catalogue loading, the effective catalogue for a harness build, and schema-hash checks.
 *
 * Why: whether a tool exists for a run at all is decided by the catalogue document in the
 *   database, so the loader validates every field before trusting one and quarantines the
 *   whole catalogue on any failure (every tool becomes unusable). A per-tool `schema_hash`
 *   catches the quieter attack: an MCP server that changes a tool's schema after review
 *   keeps its name but loses its trust (tool-system.md §4, §13, d-0038). Native tools
 *   (Read, Edit, Bash...) are different: their schema belongs to the harness build, so each
 *   build's schemas are separate rows that the owner approves (d-0088). `effectiveCatalogue`
 *   applies the installed build's rows: an approved native tool carries the approved hash, a
 *   pending or denied one is listed so `admit()` can say why it is refused. Any failure while
 *   parsing or canonicalising hostile input (non-finite numbers, deep nesting) quarantines as
 *   `malformed`; the loader never throws.
 *
 * Exports: loadCatalogue(), effectiveCatalogue(), schemaMatches().
 * Depends on: schemas/catalogue, shared/canonical-json, shared/hmac (sha256Hex),
 *   types/catalogue. No IO.
 */

import { CatalogueDoc } from '#/schemas/catalogue.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import { canonicalJson } from '#/shared/canonical-json.js';
import { sha256Hex } from '#/shared/hmac.js';
import type {
  CatalogueState,
  EffectiveCatalogue,
  NativeSchemaRow,
} from '#/types/catalogue.types.js';

const QUARANTINED: CatalogueState = { status: 'quarantined', reason: 'malformed' };

function build(entries: readonly ToolDefinition[]): CatalogueState {
  const tools = new Map<string, ToolDefinition>();
  for (const def of entries) {
    if (tools.has(def.id)) {
      return QUARANTINED;
    }

    tools.set(def.id, def);
  }

  return { status: 'verified', tools, hash: sha256Hex(canonicalJson(entries)) };
}

/**
 * Validates a catalogue document. Anything but a schema-conforming, duplicate-free
 * catalogue yields `quarantined`. Never throws.
 */
export function loadCatalogue(doc: unknown): CatalogueState {
  try {
    const parsed = CatalogueDoc.safeParse(doc);

    return parsed.success ? build(parsed.data.entries) : QUARANTINED;
  } catch {
    return QUARANTINED;
  }
}

/**
 * The catalogue as one harness build sees it. Native tools take their `schema_hash` from
 * the build's approved row; every native tool without an approved row is reported as
 * `pending` (never reviewed, or its schema changed) or `denied` (the owner said no), and
 * has no hash. The returned catalogue hash covers the applied hashes, so a run's recorded
 * `catalogue_hash` pins exactly what it was allowed. Never throws.
 */
export function effectiveCatalogue(
  doc: unknown,
  rows: readonly NativeSchemaRow[],
): EffectiveCatalogue {
  const quarantined = {
    catalogue: QUARANTINED,
    liveSchemaHashes: {},
    schemaStatus: {},
  };

  try {
    const parsed = CatalogueDoc.safeParse(doc);
    if (!parsed.success) {
      return quarantined;
    }

    const live: Record<string, string> = {};
    const status: Record<string, 'pending' | 'denied'> = {};
    const entries = parsed.data.entries.map((def): ToolDefinition => {
      if (def.kind !== 'harness-native') {
        return def;
      }

      const row = rows.find((r) => r.tool === def.id);
      if (row?.status === 'approved') {
        live[def.id] = row.schema_hash;

        return { ...def, schema_hash: row.schema_hash };
      }

      status[def.id] = row?.status === 'denied' ? 'denied' : 'pending';

      return def;
    });

    return { catalogue: build(entries), liveSchemaHashes: live, schemaStatus: status };
  } catch {
    return quarantined;
  }
}

/** True only when the harness reported a schema hash for `def` and it equals the catalogue's. */
export function schemaMatches(
  def: ToolDefinition,
  live: Readonly<Record<string, string>>,
): boolean {
  const reported = Object.hasOwn(live, def.id) ? live[def.id] : undefined;

  return reported !== undefined && reported === def.schema_hash;
}

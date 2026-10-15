/**
 * Hashes the built-in tool schemas a harness build sends to the model and diffs them against
 * what the owner approved.
 *
 * Why: a coding harness changes its built-in tools between builds (a renamed argument, a new
 *   option, `Task` becoming `Agent`), and policy was written against the old shapes. Forge
 *   cannot trust a tool whose shape it never saw, so each build's tools are fingerprinted
 *   from the exact request the harness makes to the model API (name plus input schema, the
 *   only place the real schema is visible) and compared with the approved fingerprint. An
 *   identical tool stays approved with no owner action; a new or changed one becomes pending
 *   and is denied until the owner approves it (d-0088). The hash of a catalogue tool that
 *   maps to several harness names (`shell` is `Bash` and `PowerShell`) covers all the names
 *   that build offers, so the owner approves the whole capability at once.
 *
 * Exports: hashToolSchema(), toolShapes(), diffToolShapes().
 * Depends on: @forge/core (CompatToolShape, HarnessToolSchema), @forge/tools (canonicalJson,
 *   sha256Hex), types/compat. No IO.
 */

import type { CompatToolShape, HarnessToolSchema } from '@forge/core';
import { canonicalJson, sha256Hex } from '@forge/tools';
import type {
  CapturedTool,
  NativeToolNames,
  ShapeDiff,
} from '#/types/compat/compat.types.js';

/** `sha256:<hex>` over the canonical name and input schema of one tool. */
export function hashToolSchema(tool: CapturedTool): string {
  return `sha256:${sha256Hex(canonicalJson({ name: tool.name, input_schema: tool.input_schema }))}`;
}

/**
 * One shape per catalogue tool the build offers under at least one of its names. A tool the
 * build does not offer at all has no shape (and so no row).
 */
export function toolShapes(
  captured: readonly CapturedTool[],
  nativeTools: NativeToolNames,
): CompatToolShape[] {
  const byName = new Map(captured.map((t) => [t.name, t]));
  const shapes: CompatToolShape[] = [];
  for (const [tool, names] of Object.entries(nativeTools)) {
    const offered = names.flatMap((n) => {
      const t = byName.get(n);

      return t ? [t] : [];
    });

    if (offered.length === 0) {
      continue;
    }

    // Sorted by name so the hash does not depend on the order the harness lists its tools.
    const sorted = [...offered].sort((a, b) => a.name.localeCompare(b.name));
    shapes.push({
      tool,
      native: sorted.map((t) => t.name),
      schema_hash:
        sorted.length === 1 && sorted[0]
          ? hashToolSchema(sorted[0])
          : `sha256:${sha256Hex(canonicalJson(sorted.map((t) => hashToolSchema(t))))}`,
    });
  }

  return shapes;
}

/**
 * Compares captured shapes with the stored rows of the same build. Only an approved row with
 * the same hash is kept; a denied row with the same hash stays denied (the owner already said
 * no to exactly this shape); anything else is pending.
 */
export function diffToolShapes(
  shapes: readonly CompatToolShape[],
  rows: readonly HarnessToolSchema[],
): ShapeDiff {
  const keep: string[] = [];
  const pending: CompatToolShape[] = [];
  for (const shape of shapes) {
    const row = rows.find((r) => r.tool === shape.tool);
    const same = row?.schema_hash === shape.schema_hash;
    if (row && same && (row.status === 'approved' || row.status === 'denied')) {
      keep.push(shape.tool);
    } else {
      pending.push(shape);
    }
  }

  return { keep, pending };
}

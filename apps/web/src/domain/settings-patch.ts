/**
 * Turns an edited settings screen into the override document the server stores.
 *
 * Why: Forge stores only what the owner changed, as numbered versions, so that a better
 *   built-in default still reaches every setting nobody touched (d-0085, d-0090). A save
 *   therefore must not send the whole effective config (that would pin every default). It
 *   sends the previous override with just this edit laid on top, and each version replaces
 *   the whole document, so dropping the earlier overrides would silently undo them. The two
 *   record-shaped settings (per-harness and per-state caps) are written whole, so removing a
 *   row removes it; arrays are always written whole, as the server merges them.
 *
 * Exports: configPatch(), applyPatch(), overrideAt(), describeChanges(), WHOLE_VALUE_PATHS.
 * Depends on: domain/config-path, @forge/core (types). Pure.
 */

import type { ConfigVersion } from '@forge/core';
import { isPlain, sameValue } from '#/domain/config-path.js';

/** Settings written as one value even though they are objects, so a removed row really goes. */
export const WHOLE_VALUE_PATHS: ReadonlySet<string> = new Set([
  'engine.max_concurrent_per_harness.by_id',
  'engine.max_concurrent_by_state',
]);

/** Only the parts of `draft` that differ from `loaded`, as a nested object (empty when nothing changed). */
export function configPatch(
  loaded: unknown,
  draft: unknown,
  path = '',
): Record<string, unknown> {
  if (!isPlain(draft) || !isPlain(loaded) || WHOLE_VALUE_PATHS.has(path)) {
    return {};
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    const here = path === '' ? key : `${path}.${key}`;
    const before = loaded[key];
    if (isPlain(value) && isPlain(before) && !WHOLE_VALUE_PATHS.has(here)) {
      const inner = configPatch(before, value, here);
      if (Object.keys(inner).length > 0) {
        patch[key] = inner;
      }
    } else if (!sameValue(before, value)) {
      patch[key] = value;
    }
  }

  return patch;
}

/** `override` with `patch` laid on top: plain objects merge, whole-value paths and everything else replace. */
export function applyPatch(
  override: Record<string, unknown>,
  patch: Record<string, unknown>,
  path = '',
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...override };
  for (const [key, value] of Object.entries(patch)) {
    const here = path === '' ? key : `${path}.${key}`;
    const current = out[key];
    out[key] =
      isPlain(value) && isPlain(current) && !WHOLE_VALUE_PATHS.has(here)
        ? applyPatch(current, value, here)
        : value;
  }

  return out;
}

/** The override document that version `version` stored; `{}` for version 0 (built-ins only) or an unknown version. */
export function overrideAt(
  history: readonly ConfigVersion[],
  version: number,
): Record<string, unknown> {
  const row = history.find((v) => v.version === version);

  return row && isPlain(row.doc) ? row.doc : {};
}

/** One line per changed leaf between two override documents, such as `engine.stall_ms = 120000`, for the history list. */
export function describeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const lines: string[] = [];
  const walk = (node: Record<string, unknown>, path: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const here = path === '' ? key : `${path}.${key}`;
      if (isPlain(value) && !WHOLE_VALUE_PATHS.has(here)) {
        walk(value, here);
      } else {
        lines.push(`${here} = ${JSON.stringify(value)}`);
      }
    }
  };

  walk(configPatch(before, after), '');

  return lines;
}

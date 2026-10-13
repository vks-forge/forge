/**
 * Front matter parser — splits a memory record file and parses its YAML header.
 *
 * Why: memory records are markdown with a YAML header, edited by hand on any OS. The
 *   reader must accept BOMs and Windows line endings, and must turn every malformed
 *   file into a reported failure instead of an exception or a half-parsed constraint.
 *   Hand-written statements often hold an unquoted colon or backtick, which strict YAML
 *   rejects; without a lenient pass for the three fields the Director needs, such
 *   records would silently drop out of the constraint set.
 *
 * Exports: parseFrontMatter().
 * Depends on: yaml, types/memory-source-deps. Pure, no IO.
 */

import { parse } from 'yaml';
import type { FrontMatterResult } from '#/types/memory-source-deps.types.js';

/** Fields the lenient pass extracts; everything else is dropped in that mode. */
const LENIENT_KEYS = ['id', 'statement', 'status'] as const;
/** A value starting with YAML syntax we do not interpret means the file is really broken. */
const STRUCTURED = /^["'[{|>&*!%@]/;

/**
 * Line-based fallback used only after strict YAML failed: reads single-line plain
 * `id`, `statement` and `status` at column 0. Refuses (undefined) when id or statement is
 * missing or starts with structured YAML, so genuinely broken files stay rejected.
 */
function lenientParse(block: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = /^([A-Za-z_][\w-]*):[ \t]+(.*?)[ \t]*$/.exec(line);
    const key = m?.[1];
    const value = m?.[2];
    if (key === undefined || value === undefined) continue;
    if (!(LENIENT_KEYS as readonly string[]).includes(key) || key in out) continue;
    if (value === '' || STRUCTURED.test(value)) return undefined;
    out[key] = value;
  }
  return out.id !== undefined && out.statement !== undefined ? out : undefined;
}

/** Parses the `---` fenced YAML block at the top of `text`; the markdown body is ignored. */
export function parseFrontMatter(text: string): FrontMatterResult {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!src.startsWith('---\n')) return { ok: false, reason: 'no front matter' };
  const rest = src.slice(4);
  const end = /^---[ \t]*$/m.exec(rest);
  if (end === null) return { ok: false, reason: 'unterminated front matter' };
  const block = rest.slice(0, end.index);

  let value: unknown;
  try {
    value = parse(block);
  } catch (err) {
    const lenient = lenientParse(block);
    if (lenient !== undefined) return { ok: true, data: lenient };
    return {
      ok: false,
      reason: `invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'front matter is not a mapping' };
  }
  return { ok: true, data: value as Record<string, unknown> };
}

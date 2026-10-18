/**
 * Lenient header reader — splits a record file and keeps every field of its YAML header that can be kept.
 *
 * Why: records were written by hand and by several writers, and a fifth of this project's own headers fail
 *   strict YAML (an unquoted colon or backtick in the statement, a flow-map source with quotes inside), while
 *   a ` #` inside a plain statement silently cuts it short without any error. Dropping such a record, or
 *   keeping a truncated statement, would change what the Director plans against. The reader tries strict
 *   YAML first; when that fails it splits the header into top-level blocks (a column-0 `key:` line plus its
 *   indented continuation), parses each block alone, and for a block that does not parse keeps its raw
 *   text, so one bad line costs only that line. The statement is also checked against its raw line so a
 *   comment, an anchor or a tag cannot hide words.
 *
 * Exports: readHeader(), splitBlocks().
 * Depends on: yaml, types/memory-import. Pure, no IO.
 */

import { parse } from 'yaml';
import type { HeaderBlock, HeaderRead } from '#/types/memory-import.types.js';

const KEY_LINE = /^([A-Za-z_][\w-]*):(?=[ \t]|$)/;
const FENCE = /^---[ \t]*$/m;
const isMapping = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The top-level blocks of a header: a `key:` line at column 0 and the indented or blank lines after it. */
export function splitBlocks(header: string): HeaderBlock[] {
  const blocks: { key: string; lines: string[] }[] = [];
  for (const line of header.split('\n')) {
    const m = KEY_LINE.exec(line);
    if (m?.[1] !== undefined) {
      blocks.push({ key: m[1], lines: [line] });
    } else if (blocks.length > 0 && !line.startsWith('#')) {
      blocks[blocks.length - 1]?.lines.push(line);
    }
  }

  return blocks.map((b) => {
    const first = b.lines[0] ?? '';

    return {
      key: b.key,
      text: b.lines.join('\n'),
      inline: first.slice(b.key.length + 1).trim(),
      rest: b.lines
        .slice(1)
        .map((l) => l.trim())
        .filter((l) => l !== ''),
    };
  });
}

const rawValue = (b: HeaderBlock): string =>
  [b.inline, ...b.rest].filter((p) => p !== '').join(' ');

/** True when YAML changed a single-line plain statement: a ` #` cut it, or an anchor or tag was eaten. */
function changedByYaml(b: HeaderBlock, parsed: unknown): boolean {
  return (
    b.rest.length === 0 &&
    b.inline !== '' &&
    !/^["'|>[{]/.test(b.inline) &&
    typeof parsed === 'string' &&
    parsed !== b.inline
  );
}

/** Reads the header of a record file: the values that parse and the keys kept as raw text. */
export function readHeader(text: string): HeaderRead {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!src.startsWith('---\n')) {
    return {
      ok: true,
      header: { data: {}, strict: true, recovered: [], text: '' },
      body: src.replace(/^\n+/, '').trimEnd(),
      hasFrontMatter: false,
    };
  }

  const rest = src.slice(4);
  const end = FENCE.exec(rest);
  if (end === null) {
    return { ok: false, reason: 'unterminated front matter' };
  }

  const headerText = rest.slice(0, end.index).replace(/\n$/, '');
  const body = rest
    .slice(end.index + end[0].length)
    .replace(/^\n{1,2}/, '')
    .trimEnd();

  const blocks = splitBlocks(headerText);
  let data: Record<string, unknown> = {};
  let strict = false;
  try {
    const value = parse(headerText) as unknown;
    if (isMapping(value)) {
      data = { ...value };
      strict = true;
    }
  } catch {
    strict = false;
  }

  const recovered: string[] = [];
  if (!strict) {
    for (const b of blocks) {
      let ok = false;
      try {
        const value = parse(b.text) as unknown;
        if (isMapping(value) && b.key in value) {
          data[b.key] = value[b.key];
          ok = true;
        }
      } catch {
        ok = false;
      }

      if (!ok) {
        data[b.key] = rawValue(b);
        recovered.push(b.key);
      }
    }
  }

  const statement = blocks.find((b) => b.key === 'statement');
  const value = data['statement'];
  const missing = typeof value !== 'string' || value.trim() === '';
  if (
    statement !== undefined &&
    !recovered.includes('statement') &&
    (changedByYaml(statement, value) || (missing && rawValue(statement) !== ''))
  ) {
    data['statement'] = rawValue(statement);
    recovered.push('statement');
  }

  return {
    ok: true,
    header: { data, strict, recovered, text: headerText },
    body,
    hasFrontMatter: true,
  };
}

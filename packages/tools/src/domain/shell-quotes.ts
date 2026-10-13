/**
 * Quote and backtick scanners for the shell tokenizer.
 *
 * Why: quoting is where shell dialects differ most (bash backslash escapes versus
 *   PowerShell doubled quotes and backtick escapes) and where a mis-parse hides a
 *   command from policy, for example `"$(rm -rf x)"`. Keeping the three scanners apart
 *   from the segment loop lets the dialect rules be read and tested in one place while
 *   the tokenizer keeps only the operator and segment state. Anything unterminated is
 *   refused, never guessed.
 *
 * Exports: scanBacktick(), scanDoubleQuoted(), scanSingleQuoted().
 * Depends on: domain/shell-flags (bail), types/tokenizer.types. No IO.
 */

import { bail } from '#/domain/shell-flags.js';
import type { QuoteHost } from '#/types/tokenizer.types.js';

/** Backtick substitution (bash). `i` is the opening backtick; returns the index after the closing one. */
export function scanBacktick(host: QuoteHost, i: number): number {
  const { src } = host;
  let j = i + 1;
  while (j < src.length && src[j] !== '`') {
    j += src[j] === '\\' ? 2 : 1;
  }

  if (j >= src.length) {
    bail();
  }

  host.sub(src.slice(i + 1, j).replace(/\\([`\\$])/g, '$1'), 0, false);

  return j + 1;
}

/** Double-quoted string starting at `i`; returns the index after the closing quote. */
export function scanDoubleQuoted(host: QuoteHost, i: number): number {
  const { src, ps } = host;
  let j = i + 1;
  host.markStarted();
  for (;;) {
    const c = src[j];
    if (c === undefined) {
      return bail();
    }

    if (c === '"') {
      if (ps && src[j + 1] === '"') {
        host.append('"');
        j += 2;
        continue;
      }

      return j + 1;
    }

    if (c === '$' && src[j + 1] === '(') {
      j = host.sub(src, j + 2, true);
      continue;
    }

    if (c === '`' && !ps) {
      j = scanBacktick(host, j);
      continue;
    }

    if (c === '`' && ps) {
      if (j + 1 >= src.length) {
        bail();
      }

      host.append(src[j + 1] as string);
      j += 2;
      continue;
    }

    if (c === '\\' && !ps) {
      const n = src[j + 1];
      if (n !== undefined && '"\\$`'.includes(n)) {
        host.append(n);
        j += 2;
        continue;
      }

      if (n === '\n') {
        j += 2;
        continue;
      }
    }

    host.append(c);
    j += 1;
  }
}

/** Single-quoted string starting at `i`; returns the index after the closing quote. */
export function scanSingleQuoted(host: QuoteHost, i: number): number {
  const { src, ps } = host;
  let j = i + 1;
  host.markStarted();
  for (;;) {
    const c = src[j];
    if (c === undefined) {
      return bail();
    }

    if (c === "'") {
      if (ps && src[j + 1] === "'") {
        host.append("'");
        j += 2;
        continue;
      }

      return j + 1;
    }

    host.append(c);
    j += 1;
  }
}

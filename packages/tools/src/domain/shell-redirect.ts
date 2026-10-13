/**
 * Redirect-operator scanner for the shell tokenizer.
 *
 * Why: a redirect is a file write or read the Worker never typed as an argument
 *   (`echo x > .env`), so policy must see its target. This scanner classifies the
 *   operator (`>`, `>>`, `>|`, `<`, fd duplication such as `2>&1`) and refuses heredocs
 *   and process substitution, which hide the real input from a text parser.
 *
 * Exports: scanRedirect().
 * Depends on: domain/shell-flags (bail), types/tokenizer.types. No IO.
 */

import { bail } from '#/domain/shell-flags.js';
import type { RedirectScan } from '#/types/tokenizer.types.js';

/** Skips the fd digits (or `-`) after `&` in `>&2` / `<&3-`. */
function skipFdTarget(src: string, from: number): number {
  let j = from;
  while (/[\d-]/.test(src[j] ?? '')) {
    j += 1;
  }

  return j;
}

/** Scans the operator at `i` (`>` or `<`); returns where it ends and the file mode, if any. */
export function scanRedirect(src: string, i: number): RedirectScan {
  const c = src[i];
  let j = i + 1;
  const n = src[j];
  if (n === '(' || (c === '<' && n === '<')) {
    bail();
  }

  if (c === '<') {
    if (n === '&') {
      return { next: skipFdTarget(src, j + 1), mode: null };
    }

    return { next: j, mode: 'read' };
  }

  if (n === '>' || n === '|') {
    j += 1;
  } else if (n === '&') {
    return { next: skipFdTarget(src, j + 1), mode: null };
  }

  return { next: j, mode: 'write' };
}

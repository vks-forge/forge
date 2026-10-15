/**
 * Word-expansion detection — bash brace expansion and dot-leading globs that can reach `..`.
 *
 * Why: the floors judge the literal argv, so a word the shell rewrites before running is
 *   invisible to them. `ls {../../..,.}` becomes `ls ../../.. .` and `cat .*` + `/.*` can
 *   match `..` at every level, walking out of the worktree to Forge's install token or
 *   database while every literal word looks harmless. The tokenizer flags such a word as an
 *   `expansion` (an `ask` on attended lanes, a deny on Express) rather than guess what it
 *   becomes; the check errs towards flagging (fail closed, code.md rule 6).
 *
 * Exports: startsBraceExpansion(), globCanMatchParent().
 * Depends on: nothing. No IO.
 */

/** Characters that end a shell word when unquoted; a `{` list cannot span them. */
const WORD_END = /[\s;|&<>()]/;

/**
 * True when the unquoted `{` at `src[i]` opens a bash brace expansion: a matching `}` in the
 * same word with an unquoted, unescaped `,` or `..` inside (`{a,b}`, `{a..z}`, `x{,.bak}`).
 * `{a}`, `{}` and an unmatched `{` are literal in bash.
 */
export function startsBraceExpansion(src: string, i: number): boolean {
  if (src[i] !== '{') {
    return false;
  }

  let depth = 0;
  let sawList = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j] as string;
    if (c === '\\') {
      j += 1;
    } else if (c === "'" || c === '"') {
      const close = src.indexOf(c, j + 1);
      if (close === -1) {
        return false;
      }

      j = close;
    } else if (WORD_END.test(c)) {
      return false;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        return sawList;
      }
    } else if (c === ',' || (c === '.' && src[j + 1] === '.')) {
      sawList = true;
    }
  }

  return false;
}

/** Translates one glob component to a regular expression source; `null` when it is not a glob. */
function componentPattern(comp: string): string | null {
  let out = '';
  let isGlob = false;
  for (let k = 0; k < comp.length; k++) {
    const c = comp[k] as string;
    if (c === '*') {
      out += '.*';
      isGlob = true;
    } else if (c === '?') {
      out += '.';
      isGlob = true;
    } else if (c === '[') {
      const close = comp.indexOf(']', k + 2);
      if (close === -1) {
        out += '\\[';
      } else {
        const body = comp.slice(k + 1, close);
        const negated = body.startsWith('!') || body.startsWith('^');
        const set = (negated ? body.slice(1) : body).replace(/[\\\]^]/g, '\\$&');
        out += `[${negated ? '^' : ''}${set}]`;
        isGlob = true;
        k = close;
      }
    } else {
      out += c.replace(/[.+(){}|\\^$]/g, '\\$&');
    }
  }

  return isGlob ? out : null;
}

/**
 * True when the word component starting at `src[i]` is an unquoted glob that begins with `.`
 * and can match `..` (`.*`, `.?`, `.[.]`, `..*`). Bash with `globskipdots` off (older
 * versions) and PowerShell-style wildcards both make such a component reach the parent, so
 * a chain of them leaves the worktree. `.*.ts` cannot match `..` and is not flagged.
 */
export function globCanMatchParent(src: string, i: number): boolean {
  if (src[i] !== '.') {
    return false;
  }

  let end = i;
  while (end < src.length && !/[\s/\\;|&<>()'"`$]/.test(src[end] as string)) {
    end += 1;
  }

  const pattern = componentPattern(src.slice(i, end));
  if (pattern === null) {
    return false;
  }

  try {
    return new RegExp(`^${pattern}$`).test('..');
  } catch {
    return true;
  }
}

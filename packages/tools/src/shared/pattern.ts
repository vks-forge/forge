/**
 * Command and tool-name pattern matching with prefix semantics.
 *
 * Why: call-time rules decide on text a model wrote, so the matcher is a security
 *   boundary. Shell patterns must let `pnpm test*` cover `pnpm test --run` but never
 *   `pnpm testbackdoor`, and `*` must cross `/` (shell arguments are full of paths),
 *   which a path glob does not. Rules also need a specificity order so a narrow rule
 *   beats a broad one (longest-prefix), and tool-id patterns need a plain `*` glob
 *   (tool-system.md §5.2).
 *
 * Exports: commandMatch(), literalPrefixLength(), toolMatch().
 * Depends on: No IO.
 */

const SPECIAL = /[\\^$.*+?()[\]{}|]/;

function escapeRegex(ch: string): string {
  return SPECIAL.test(ch) ? `\\${ch}` : ch;
}

function wildcardSource(body: string): string {
  let src = '';
  for (const ch of body) src += ch === '*' ? '.*' : escapeRegex(ch);
  return src;
}

/**
 * Matches a normalised shell segment against a rule pattern. `*` matches any run of
 * characters including `/`. A trailing `*` glued to a word (`pnpm test*`) means "this
 * command, optionally followed by a space and arguments"; `pnpm add *` requires an
 * argument. Case-insensitive for PowerShell.
 */
export function commandMatch(pattern: string, text: string, ignoreCase = false): boolean {
  const glued = pattern.length > 1 && pattern.endsWith('*') && !pattern.endsWith(' *');
  const body = glued ? pattern.slice(0, -1) : pattern;
  const src = wildcardSource(body) + (glued ? '(?: .*)?' : '');
  return new RegExp(`^${src}$`, ignoreCase ? 'is' : 's').test(text);
}

/** Length of the literal text before the first `*`; the specificity used for longest-prefix. */
export function literalPrefixLength(pattern: string): number {
  const i = pattern.indexOf('*');
  return i === -1 ? pattern.length : i;
}

/** Plain wildcard match: `*` matches any run of characters (tool ids, URLs, queries). */
export function toolMatch(pattern: string, text: string): boolean {
  return new RegExp(`^${wildcardSource(pattern)}$`, 's').test(text);
}

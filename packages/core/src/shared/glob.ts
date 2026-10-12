/**
 * Minimal glob matcher (`**`, `*`, `?`) for path rules.
 *
 * Why: tier-C path globs decide lane and tier (director-core.md §6,
 *   verification-plane.md); a ~30-line matcher here keeps core at one dependency, `zod`
 *   (code.md rule 11).
 *
 * Exports: globMatch().
 * Depends on: No IO.
 */

function escapeRegex(ch: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
}

function globToRegex(glob: string): RegExp {
  const g = glob.replaceAll('\\', '/');
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const ch = g.charAt(i);
    if (ch === '*' && g.charAt(i + 1) === '*') {
      if (g.charAt(i + 2) === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (ch === '*') {
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(ch);
    }
  }
  return new RegExp(`^${out}$`);
}

/** True when `path` matches `glob`; backslashes are normalised so Windows-style input matches. */
export function globMatch(glob: string, path: string): boolean {
  return globToRegex(glob).test(path.replaceAll('\\', '/'));
}

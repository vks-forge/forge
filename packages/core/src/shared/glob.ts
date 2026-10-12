/**
 * Minimal glob matcher (`**`, `*`, `?`) for path rules.
 *
 * Why: tier-C paths (auth, migrations, secrets, billing) decide a ticket's lane and who
 *   must sign off, and one glob list drives triage, gates and the merge policy. Matching
 *   must be exact and identical everywhere: a path that slips past a glob lets a
 *   high-blast-radius change take the cheap lane, and backslash paths from the Windows
 *   dev host must match the same patterns. A small in-house matcher keeps core free of
 *   runtime dependencies beyond zod (director-core.md §6, verification-plane.md §7).
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

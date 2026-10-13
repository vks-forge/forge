/**
 * Minimal glob matcher (`**`, `*`, `?`) for path rules, with gitignore-style depth.
 *
 * Why: tier-C paths (auth, migrations, secrets, billing) decide a ticket's lane and who
 *   must sign off, and one glob list drives triage, gates and the merge policy. Matching
 *   must be exact and identical everywhere: a path that slips past a glob lets a
 *   high-blast-radius change take the cheap lane, and backslash paths from the Windows
 *   dev host must match the same patterns. A small in-house matcher keeps core free of
 *   runtime dependencies beyond zod (director-core.md §6, verification-plane.md §7).
 *
 * Grammar: `*` any run of non-slash characters, `?` one non-slash character, `**` anything
 *   including slashes (`**\/` also matches zero directories), every other character is
 *   literal, `\` in either side is read as `/`. A pattern with no slash matches the
 *   file or directory name at any depth (`*.sql` matches `db/migrations/x.sql`); a
 *   pattern containing a slash is anchored to the root. Runs of `*` are collapsed before
 *   compiling so a hostile pattern cannot trigger catastrophic backtracking.
 *
 * Exports: globMatch().
 * Depends on: No IO.
 */

function escapeRegex(ch: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Rewrites a glob so it cannot compile to a backtracking trap: a run of `*` is one
 * `**`, and repeated `**\/` segments are one. Neither changes what the glob matches.
 */
function normalise(glob: string): string {
  return glob
    .replaceAll('\\', '/')
    .replace(/\*{2,}/g, '**')
    .replace(/(?:\*\*\/)+/g, '**/');
}

function globToRegex(glob: string): RegExp {
  const g = normalise(glob);
  // gitignore: a pattern with no slash matches the name at any depth.
  let out = g.includes('/') ? '' : '(?:.*/)?';
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

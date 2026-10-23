/**
 * Entry-name globs: `*` and `?` against a bare file or folder name.
 *
 * Why: detection looks at the names in one folder (`go.mod`, `*.csproj`, `requirements*.txt`)
 *   and must not mistake a glob with a folder part for a root file. Both project detection and
 *   setup detection read names this way, so the matcher lives once.
 *
 * Exports: entryMatcher(), hasEntry().
 * Depends on: none. No IO.
 */

/** A root-level glob as a case-insensitive matcher; patterns with a folder part never match a bare name. */
export function entryMatcher(glob: string): RegExp | null {
  if (glob.includes('/')) {
    return null;
  }

  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${source}$`, 'i');
}

/** True when some entry name matches `glob`. */
export function hasEntry(entries: readonly string[], glob: string): boolean {
  const match = entryMatcher(glob);

  return match !== null && entries.some((name) => match.test(name));
}

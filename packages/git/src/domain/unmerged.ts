/**
 * Reading git's list of unmerged index entries.
 *
 * Why: after a conflicted merge, `git ls-files -u -z` is the only complete account of what
 *   conflicted and how: which of the three sides (common ancestor 1, ticket 2, base 3) still
 *   have the file tells a text or binary clash from one side deleting what the other changed.
 *   Parsing it here, away from the process code, keeps that reading testable without a repo.
 *
 * Exports: parseUnmerged(), looksBinary().
 * Depends on: none. No IO.
 */

const ENTRY = /^\d+ ([0-9a-f]+) ([123])\t(.*)$/s;

/**
 * Parses `git ls-files -u -z` into the blob id of each stage (1 ancestor, 2 ticket, 3 base)
 * that exists, per path, in the order git lists the paths.
 */
export function parseUnmerged(out: string): Map<string, Map<number, string>> {
  const paths = new Map<string, Map<number, string>>();

  for (const entry of out.split('\0')) {
    const m = ENTRY.exec(entry);
    if (!m) {
      continue;
    }

    const [, blob = '', stage = '', path = ''] = m;
    const stages = paths.get(path) ?? new Map<number, string>();
    stages.set(Number(stage), blob);
    paths.set(path, stages);
  }

  return paths;
}

/** Git's own test for a binary file: a NUL byte in the first 8000 bytes. */
export function looksBinary(content: string): boolean {
  return content.slice(0, 8000).includes('\0');
}

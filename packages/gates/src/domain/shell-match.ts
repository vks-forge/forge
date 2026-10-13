/**
 * Shell receipt matcher — did a recorded shell command actually run the test command?
 *
 * Why: a Worker's `ran_tests` claim is backed by the policy's shell receipt, which records
 *   the command text. Substring matching let `echo pnpm test` or `git commit -m "pnpm test"`
 *   count as a test run. A segment now has to start with the test command, split on the
 *   shell's own separators; a piped segment, or one that only asks for `--help`/`--version`,
 *   runs no tests and does not count. Quoting is not parsed: a line the matcher cannot be
 *   sure of is rejected, which costs an honest Worker one rework, never a false pass.
 *
 * Exports: runsTestCommand().
 * Depends on: none. No IO.
 */

const SEPARATORS = /;|&&|\|\|/;
const ENV_PREFIX = /^(?:[a-z_][a-z0-9_]*=\S*\s+)*/;
const INFO_ONLY = new Set(['--help', '-h', '--version']);

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * True when some segment of the recorded shell resource (split on `;`, `&&`, `||`) starts
 * with `testCommand` after whitespace and case folding, is not piped, and does not ask for
 * help or a version. Leading `NAME=value` assignments are ignored.
 */
export function runsTestCommand(resource: string | null, testCommand: string): boolean {
  if (resource === null) {
    return false;
  }

  const wanted = squash(testCommand);
  // A test command that is itself a compound line is matched against the whole resource.
  const segments = SEPARATORS.test(wanted) ? [resource] : resource.split(SEPARATORS);

  return segments.some((raw) => {
    if (raw.includes('|')) {
      return false;
    }

    const segment = squash(raw).replace(ENV_PREFIX, '');
    if (segment !== wanted && !segment.startsWith(`${wanted} `)) {
      return false;
    }

    return !segment
      .slice(wanted.length)
      .split(' ')
      .some((token) => INFO_ONLY.has(token));
  });
}

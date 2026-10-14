/**
 * Recognises a `cd` into the run's own working directory, which changes nothing.
 *
 * Why: a Worker's shell already starts in its worktree, yet models habitually write
 *   `cd <worktree> ; ls ...`. `cd` has no allow rule, so on an unattended lane the `ask`
 *   becomes a `deny` and the whole compound command is lost with it (probe 8, 2026-10-14).
 *   A `cd` to the exact directory the run is already in cannot move the shell anywhere,
 *   so that one spelling is harmless and may be allowed. Everything else stays as it was:
 *   a bare `cd` (home), `..`, `-`, a sub-directory, an extra argument, a flag, a
 *   substitution or a redirect all fall through to the normal rules, and the segments
 *   chained after the `cd` are still judged on their own.
 *
 * Exports: isCdToCwd().
 * Depends on: types/tokenizer. No IO.
 */

import type { ShellDialect, ShellSegment } from '#/types/tokenizer.types.js';

const BASH_CD = new Set(['cd']);
const POWERSHELL_CD = new Set(['cd', 'set-location', 'sl', 'chdir']);

/** Slashes unified, trailing slashes dropped; case folded only where the filesystem ignores it. */
function spelled(path: string, foldCase: boolean): string {
  const p = path.replaceAll('\\', '/').replace(/(?<=.)\/+$/, '');

  return foldCase ? p.toLowerCase() : p;
}

/** True when `seg` is exactly `cd <the run cwd>` (or `cd .`) with nothing else attached. */
export function isCdToCwd(
  seg: ShellSegment,
  dialect: ShellDialect,
  cwd: string | undefined,
): boolean {
  if (cwd === undefined || cwd === '' || seg.argv.length !== 2) {
    return false;
  }

  if (
    seg.assignments.length > 0 ||
    seg.redirects.length > 0 ||
    seg.flags.length > 0 ||
    seg.nested
  ) {
    return false;
  }

  const [word, target] = seg.argv as [string, string];
  // Bare command word only: `./cd` or `cd.exe` is some other program.
  const name = dialect === 'powershell' ? word.toLowerCase() : word;
  const known = dialect === 'powershell' ? POWERSHELL_CD : BASH_CD;
  if (!known.has(name)) {
    return false;
  }

  if (target === '.') {
    return true;
  }

  const foldCase = dialect === 'powershell' || /^[a-z]:/i.test(cwd);

  return spelled(target, foldCase) === spelled(cwd, foldCase);
}

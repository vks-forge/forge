/**
 * Git path floor — git options that read or point at files outside the worktree.
 *
 * Why: `git diff`, `git add`, `git commit` and `git stash` run unattended in every lane, and
 *   git can open an arbitrary file by itself: `diff --no-index` diffs two files that need not
 *   be in any repository, `commit -F <file>` and `add --pathspec-from-file=<file>` read one,
 *   and `-C`, `--git-dir` and `--work-tree` re-point git at another repository. Forge's data
 *   home (database, install token, run secrets) is reachable that way even though no
 *   "reader" command is involved. A Worker's git work is inside its own worktree, so these
 *   options are refused outright, and the file-reading options are refused when their value
 *   leaves the worktree. Git accepts unique abbreviations of long options, so each pattern
 *   accepts the prefixes too (tool-system.md §5.0).
 *
 * Exports: gitPathViolation().
 * Depends on: shared/path. No IO.
 */

import { isInside } from '#/shared/path.js';

const RULE = 'floor:argv:git-outside-worktree';

/** Options git refuses to take a repository-external meaning from: denied wherever they appear. */
const ALWAYS = [
  /^--no-i(n(d(e(x)?)?)?)?(=|$)/,
  /^--git-d(i(r)?)?(=|$)/,
  /^--work-t(r(e(e)?)?)?(=|$)/,
  /^--tem(p(l(a(t(e)?)?)?)?)?(=|$)/,
  /^--namespace(=|$)/,
  /^--super-prefix(=|$)/,
];

/** Options whose value is a file git reads. */
const FILE_LONG = [/^--pathspec-f(r(o(m(-(f(i(l(e)?)?)?)?)?)?)?)?$/, /^--fil(e)?$/];
const FILE_SUBCOMMANDS = new Set(['commit', 'tag', 'notes']);

/** Global options that take a separate value, so the value is not the subcommand. */
const GLOBAL_WITH_VALUE = new Set(['-c', '--exec-path', '--config-env']);

const escapes = (value: string, cwd: string | undefined): boolean => {
  if (value === '-') {
    return false;
  }

  if (cwd === undefined) {
    return /^(?:[a-zA-Z]:|[\\/]|~|\.\.)/.test(value);
  }

  return !isInside(value, cwd);
};

/** A rule id when `args` (everything after `git`) points git outside the worktree, else `null`. */
export function gitPathViolation(
  args: readonly string[],
  cwd: string | undefined,
): string | null {
  // Global options come before the subcommand; `-C` there is a path, after `commit` it is a commit.
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '-C' || /^-C./.test(a)) {
      return RULE;
    }

    if (GLOBAL_WITH_VALUE.has(a)) {
      i++;
    } else if (!a.startsWith('-')) {
      break;
    }
  }

  const sub = args.find((a) => FILE_SUBCOMMANDS.has(a));
  for (const [i, a] of args.entries()) {
    const long = a.startsWith('--');
    const [name = '', ...rest] = a.split('=');
    if (long && ALWAYS.some((re) => re.test(name))) {
      return RULE;
    }

    const isFile =
      (long && FILE_LONG.some((re) => re.test(name))) ||
      (sub !== undefined && !long && /^-F/.test(a));

    if (!isFile) {
      continue;
    }

    let value: string | undefined;
    if (long) {
      value = rest.length > 0 ? rest.join('=') : args[i + 1];
    } else {
      value = a.length > 2 ? a.slice(2) : args[i + 1];
    }

    if (value !== undefined && escapes(value, cwd)) {
      return RULE;
    }
  }

  return null;
}

/**
 * Exact check rules — the unattended allow for project checks led by an interpreter.
 *
 * Why: a project whose check is `node scripts/lint.mjs` or `python -m pytest` must let its
 *   Worker run that check on Express, where nobody answers an `ask`, yet an allow on `node*`
 *   or `python*` would allow `node -e "<anything>"`. So each such check becomes one allow rule
 *   that matches the segment word for word, from the directory the check is configured to
 *   run in, and only when nothing surrounds it (no `NAME=` prefix, redirect, pipe, expansion,
 *   extra argument). The script it names is a worktree file, which the gates guard against
 *   edits by the Worker, so "exactly this command" stays "exactly the reviewed script". Checks
 *   that do not fit (bare interpreters, eval flags, package launchers that fetch code, paths
 *   outside the worktree, anything needing quotes or wildcards) get no rule and stay an
 *   `ask`, which is a denial on Express (d-0095).
 *
 * Exports: exactCheckRules(), EXACT_INTERPRETERS, FIXED_MODULE_CHECKS.
 * Depends on: domain/command-classes, schemas/grant, shared/path, types/shell-allowlist. No IO.
 */

import { isEvalFlag } from '#/domain/command-classes.js';
import type { CallRule } from '#/schemas/grant.js';
import { absolutePath } from '#/shared/path.js';
import type { ShellAllowInput } from '#/types/shell-allowlist.types.js';

/** Interpreters whose first argument is a script file; the only first words an exact rule may have. */
export const EXACT_INTERPRETERS: ReadonlySet<string> = new Set([
  'node',
  'python',
  'python3',
  'py',
  'bash',
  'sh',
  'pwsh',
  'powershell',
  'ruby',
  'php',
  'deno',
  'bun',
]);

const PYTHONS = ['python', 'python3', 'py'];
const PYTHON_MODULES = ['-m pytest', '-m ruff check .', '-m unittest', '-m mypy .'];

/**
 * Module and flag-only checks that load no file chosen by an argument. They are allowed only as
 * this exact text: `python -m pytest -p evil` or `node --test --import x` is a different command.
 */
export const FIXED_MODULE_CHECKS: ReadonlySet<string> = new Set([
  'node --test',
  ...PYTHONS.flatMap((p) => PYTHON_MODULES.map((m) => `${p} ${m}`)),
]);

/** Characters whose meaning is the same in every shell: no quotes, backslashes, wildcards, `~`, `$`, `!`. */
const PLAIN_WORDS = /^[A-Za-z0-9_./:@%+=,-]+( [A-Za-z0-9_./:@%+=,-]+)*$/;

/** A relative path to a file inside the worktree: no root, drive, `~`, `..` or empty segment. */
function isWorktreeFile(word: string): boolean {
  if (/^(-|\/|~|[A-Za-z]:)/.test(word)) {
    return false;
  }

  const segments = word.replace(/^\.\//, '').split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return false;
  }

  return word.includes('/') || /\.[A-Za-z0-9]+$/.test(word);
}

/** The exact text a check may be allowed as, or `null` when it does not qualify. */
function exactText(command: string): string | null {
  const text = command.trim().replace(/\s+/g, ' ');
  if (!PLAIN_WORDS.test(text)) {
    return null;
  }

  if (FIXED_MODULE_CHECKS.has(text)) {
    return text;
  }

  const [first = '', second = '', ...rest] = text.split(' ');
  if (
    !EXACT_INTERPRETERS.has(first) ||
    !isWorktreeFile(second) ||
    rest.some(isEvalFlag)
  ) {
    return null;
  }

  return text;
}

/** The directory a check runs in: the run's cwd joined with its configured `cwd`, never above it. */
function checkCwd(runCwd: string, cwd: string | undefined): string | null {
  if (
    cwd !== undefined &&
    (/^([A-Za-z]:)?[\\/]/.test(cwd) || cwd.split(/[\\/]/).includes('..'))
  ) {
    return null;
  }

  return absolutePath(cwd ?? '.', runCwd);
}

/**
 * One `strict` allow rule per interpreter-led project check that qualifies. Without a run cwd
 * (the directory the check's own `cwd` is relative to) nothing can be matched, so nothing is built.
 */
export function exactCheckRules(input: ShellAllowInput | undefined): CallRule[] {
  const checks = input?.checks;
  const runCwd = input?.runCwd;
  if (checks === undefined || runCwd === undefined || runCwd.trim() === '') {
    return [];
  }

  const rules = new Map<string, CallRule>();
  for (const check of checks) {
    const text = exactText(check.command);
    const cwd = checkCwd(runCwd, check.cwd);
    if (text === null || cwd === null) {
      continue;
    }

    const key = `${cwd}\n${text}`;
    if (!rules.has(key)) {
      rules.set(key, {
        id: `check:exact#${rules.size}`,
        action: 'shell',
        resource: text,
        effect: 'allow',
        strict: { cwd },
      });
    }
  }

  return [...rules.values()];
}

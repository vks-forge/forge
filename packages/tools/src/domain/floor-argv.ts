/**
 * Argv-aware floors — hardline denials that survive reordered flags and wrappers.
 *
 * Why: literal prefix floors such as `git push*` are dodged by `git -C x push`,
 *   `sudo npm publish` or `rm -rf ./`. Workers must never push, publish, or wipe the
 *   repo, the home directory or a drive, however the command is spelled. This reads the
 *   tokenized argv: it strips wrappers (`env`, `sudo`, `command`, `time`...), finds the
 *   real command, and denies by what the arguments mean. A command that merely quotes the
 *   words (`echo "git push"`) has a different argv[0] and is untouched. The literal floors
 *   stay as a fallback (tool-system.md §5.0).
 *
 * Exports: floorViolation().
 * Depends on: domain/shell-flags, shared/path, types/tokenizer. No IO.
 */

import { baseName } from '#/domain/shell-flags.js';
import { normalizePath } from '#/shared/path.js';
import type { ShellSegment } from '#/types/tokenizer.types.js';

const WRAPPERS = new Set([
  'env',
  'sudo',
  'doas',
  'command',
  'builtin',
  'exec',
  'time',
  'nohup',
  'nice',
]);
const WRAPPER_OPTS_WITH_VALUE = new Set([
  '-u',
  '-g',
  '-h',
  '-p',
  '-c',
  '-d',
  '-r',
  '-t',
  '-n',
]);
const PUBLISHERS = new Set(['npm', 'pnpm', 'yarn', 'cargo', 'twine']);
const HOME_FORMS = new Set(['~', '$home', '${home}', '$env:home', '$env:userprofile']);

/** Drops leading wrappers and their options/assignments; returns the real command's argv. */
function realArgv(argv: readonly string[]): string[] {
  let i = 0;
  while (i < argv.length && WRAPPERS.has(baseName(argv[i] ?? '', 'powershell'))) {
    i += 1;
    while (i < argv.length) {
      const t = argv[i] ?? '';
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) i += 1;
      else if (t.startsWith('-')) i += WRAPPER_OPTS_WITH_VALUE.has(t) ? 2 : 1;
      else break;
    }
  }
  return argv.slice(i);
}

const hasInOrder = (args: readonly string[], ...seq: string[]): boolean => {
  let k = 0;
  for (const a of args) if (a === seq[k] && ++k === seq.length) return true;
  return false;
};

function isRecursive(cmd: string, args: readonly string[]): boolean {
  if (cmd === 'rm') {
    return args.some((a) => a === '--recursive' || /^-[A-Za-z]*[rR][A-Za-z]*$/.test(a));
  }
  return args.some((a) => /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i.test(a));
}

/** True for `/`, `~`, `$HOME`, a drive root, the repo root, or a parent of it, with or without `/*`. */
function isCatastrophicTarget(target: string, cwd?: string): boolean {
  let t = target.replaceAll('\\', '/');
  if (t.endsWith('/*')) t = t.slice(0, -2);
  if (t === '') return true;
  const lower = t.replace(/\/+$/, '').toLowerCase();
  if (HOME_FORMS.has(lower) || /^[a-z]:$/.test(lower)) return true;
  const n = normalizePath(t, cwd);
  return n === '/' || n === '.' || /^[A-Za-z]:\/$/.test(n) || /^(\.\.\/?)+$/.test(n);
}

/**
 * Returns a rule id (`floor:argv:<name>`) when the segment pushes, publishes, or
 * recursively deletes a catastrophic target; otherwise `null`.
 */
export function floorViolation(seg: ShellSegment, cwd?: string): string | null {
  const argv = realArgv(seg.argv);
  const cmd = baseName(argv[0] ?? '', 'powershell');
  const args = argv.slice(1);
  if (cmd === 'git' && args.includes('push')) return 'floor:argv:git-push';
  if (
    cmd === 'gh' &&
    (hasInOrder(args, 'pr', 'merge') || hasInOrder(args, 'release', 'create'))
  ) {
    return 'floor:argv:gh-release';
  }
  if (PUBLISHERS.has(cmd) && args.some((a) => a === 'publish' || a === 'upload')) {
    return 'floor:argv:publish';
  }
  if ((cmd === 'rm' || cmd === 'remove-item') && isRecursive(cmd, args)) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.some((t) => isCatastrophicTarget(t, cwd)))
      return 'floor:argv:recursive-delete';
  }
  return null;
}

/**
 * Argv-aware floors — hardline denials that survive reordered flags and wrappers.
 *
 * Why: literal prefix floors such as `git push*` are dodged by `git -C x push`,
 *   `sudo npm publish`, `timeout 10 git push` or `rm -rf ./`. Workers must never push,
 *   publish, change git config that runs commands or pushes (`git -c alias.p=push p`,
 *   `core.sshCommand`, `core.hooksPath`), or wipe the repo, the home directory, a drive, the
 *   worktree or any ancestor of it, however the command is spelled. This reads the
 *   tokenized argv: it looks through wrappers (every later word of a wrapped segment is a
 *   possible command start), finds the real command, and denies by what the arguments
 *   mean. A command that merely quotes the words (`echo "git push"`) has a different argv[0]
 *   and is untouched. The literal floors stay as a fallback (tool-system.md §5.0).
 *
 * Exports: floorViolation().
 * Depends on: domain/command-candidates, shared/path, types/tokenizer. No IO.
 */

import {
  ASSIGNMENT,
  commandCandidates,
  commandName,
} from '#/domain/command-candidates.js';
import { absolutePath, isInside, normalizePath } from '#/shared/path.js';
import type { ShellSegment } from '#/types/tokenizer.types.js';

const PUBLISHERS = new Set(['npm', 'pnpm', 'yarn', 'cargo', 'twine']);
const HOME_FORMS = new Set(['~', '$home', '${home}', '$env:home', '$env:userprofile']);
/** `/s`-style flags of cmd.exe delete commands; not paths. */
const CMD_DELETERS = new Set(['rd', 'rmdir', 'del', 'erase']);
const DELETERS = new Set(['rm', 'remove-item', 'ri', 'rimraf', ...CMD_DELETERS]);

/** git config keys that run a program, load other config, or change where/how it pushes. */
const RISKY_GIT_CONFIG =
  /^(alias\.|core\.(sshcommand|hookspath|fsmonitor|pager|editor|askpass|gitproxy|attributesfile)|push\.|remote\.|url\.|credential\.|diff\.external|difftool\.|mergetool\.|merge\.[^.]+\.driver|filter\.|include\.|includeif\.|protocol\.|sequence\.editor|gpg\.|ssh\.|pager\.|uploadpack\.|receive\.)/i;

const RISKY_GIT_ENV =
  /^GIT_(SSH|SSH_COMMAND|CONFIG[A-Z_]*|EXTERNAL_DIFF|ASKPASS|PAGER|EDITOR|PROXY_COMMAND|EXEC_PATH|TEMPLATE_DIR)=/i;

const hasInOrder = (args: readonly string[], ...seq: string[]): boolean => {
  let k = 0;
  for (const a of args) {
    if (a === seq[k] && ++k === seq.length) {
      return true;
    }
  }

  return false;
};

function isRecursive(cmd: string, args: readonly string[]): boolean {
  if (cmd === 'rimraf') {
    return true;
  }

  if (CMD_DELETERS.has(cmd) && args.some((a) => /^\/s$/i.test(a))) {
    return true;
  }

  if (cmd === 'rm') {
    return args.some((a) => a === '--recursive' || /^-[A-Za-z]*[rR][A-Za-z]*$/.test(a));
  }

  return args.some((a) => /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i.test(a));
}

/**
 * True for `/`, `~`, `$HOME`, a drive root, a bare `*`, the worktree, or any ancestor of it,
 * with or without a trailing `/*`.
 */
function isCatastrophicTarget(target: string, cwd?: string): boolean {
  let t = target.replaceAll('\\', '/');
  if (t.endsWith('/*')) {
    t = t.slice(0, -2);
  }

  if (t === '' || t === '*') {
    return true;
  }

  const lower = t.replace(/\/+$/, '').toLowerCase();
  if (HOME_FORMS.has(lower) || /^[a-z]:$/.test(lower)) {
    return true;
  }

  const abs = absolutePath(t, cwd);
  if (abs === '/' || abs === '//' || /^[a-z]:\/$/.test(abs)) {
    return true;
  }

  if (cwd === undefined) {
    const n = normalizePath(t);

    return n === '.' || /^(\.\.\/?)+$/.test(n);
  }

  return isInside(cwd, abs);
}

function gitViolation(args: readonly string[]): string | null {
  if (args.includes('push')) {
    return 'floor:argv:git-push';
  }

  for (const [i, a] of args.entries()) {
    if (a === '-c' || a === '--config-env') {
      const key = (args[i + 1] ?? '').split('=')[0] ?? '';
      if (a === '--config-env' || RISKY_GIT_CONFIG.test(key)) {
        return 'floor:argv:git-config';
      }
    } else if (/^-c[^c]/.test(a) || a.startsWith('--config-env=')) {
      if (
        a.startsWith('--config-env=') ||
        RISKY_GIT_CONFIG.test(a.slice(2).split('=')[0] ?? '')
      ) {
        return 'floor:argv:git-config';
      }
    } else if (/^--(exec-path|upload-pack|receive-pack)/.test(a)) {
      return 'floor:argv:git-config';
    }
  }

  return null;
}

function commandViolation(
  cwd: string | undefined,
  argv: readonly string[],
): string | null {
  const cmd = commandName(argv[0]);
  const args = argv.slice(1);
  if (cmd === 'git') {
    return gitViolation(args);
  }

  if (
    cmd === 'gh' &&
    (hasInOrder(args, 'pr', 'merge') || hasInOrder(args, 'release', 'create'))
  ) {
    return 'floor:argv:gh-release';
  }

  if (PUBLISHERS.has(cmd) && args.some((a) => a === 'publish' || a === 'upload')) {
    return 'floor:argv:publish';
  }

  if (DELETERS.has(cmd) && isRecursive(cmd, args)) {
    const targets = args.filter(
      (a) => !a.startsWith('-') && !(CMD_DELETERS.has(cmd) && /^\/[a-z]$/i.test(a)),
    );

    if (targets.some((t) => isCatastrophicTarget(t, cwd))) {
      return 'floor:argv:recursive-delete';
    }
  }

  return null;
}

/**
 * Returns a rule id (`floor:argv:<name>`) when the segment pushes, publishes, runs git with
 * config that executes programs, or recursively deletes a catastrophic target; otherwise
 * `null`.
 */
export function floorViolation(seg: ShellSegment, cwd?: string): string | null {
  const candidates = commandCandidates(seg.argv);
  const runsGit = candidates.some((c) => commandName(c[0]) === 'git');
  if (runsGit) {
    const env = [...seg.assignments, ...seg.argv.filter((t) => ASSIGNMENT.test(t))];
    if (env.some((e) => RISKY_GIT_ENV.test(e))) {
      return 'floor:argv:git-config';
    }
  }

  for (const c of candidates) {
    const v = commandViolation(cwd, c);
    if (v !== null) {
      return v;
    }
  }

  return null;
}

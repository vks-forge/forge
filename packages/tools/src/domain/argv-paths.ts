/**
 * Argv paths — files a command reads or writes that no redirect shows.
 *
 * Why: the path floors guard the `read`, `edit` and `write` tools, but a Worker can reach
 *   the same files through the shell: `cat .env`, `ls ../../.forge/data`, `Get-Content
 *   forge.db`, or `git diff --output=.env`, which writes a file by itself. This module lifts
 *   those paths out of an argv so the rule engine can judge them as `read` and `write`
 *   calls and the same floors apply. A glob such as `cat .e*` is expanded by the shell
 *   later; it is checked against the names the floors protect, because refusing a glob that
 *   could only match credentials is safer than guessing (tool-system.md §5.0).
 *
 * Exports: argvReads(), argvWrites(), wildcardHitsFloor().
 * Depends on: shared/path. No IO.
 */

import { normalizePath } from '#/shared/path.js';

/** Commands whose non-option arguments are files or directories they read or list. */
const READERS = new Set([
  'ls',
  'dir',
  'gci',
  'get-childitem',
  'tree',
  'cat',
  'type',
  'gc',
  'get-content',
  'more',
  'less',
  'head',
  'tail',
  'tac',
  'nl',
  'wc',
  'od',
  'xxd',
  'strings',
  'base64',
  'sort',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'findstr',
  'select-string',
  'sls',
  'get-item',
  'gi',
  'cp',
  'copy',
  'copy-item',
  'cpi',
]);

const GIT_OUTPUT_COMMANDS = new Set(['log', 'diff', 'show', 'format-patch']);

/** Non-option arguments of a reader; `-` (stdin) and empty words are not paths. */
export function argvReads(cmd: string, args: readonly string[]): string[] {
  if (!READERS.has(cmd)) return [];
  return args.filter((a) => a !== '' && a !== '-' && !a.startsWith('-'));
}

const matchesName = (flag: string, long: string): boolean =>
  flag.length >= 5 && long.startsWith(flag);

/** Files written by a `git log|diff|show|format-patch` output option. */
export function argvWrites(cmd: string, args: readonly string[]): string[] {
  if (cmd !== 'git' || !args.some((a) => GIT_OUTPUT_COMMANDS.has(a))) return [];
  const out: string[] = [];
  for (const [i, a] of args.entries()) {
    const [name = '', ...value] = a.split('=');
    if (
      a.startsWith('--') &&
      (matchesName(name, '--output') || matchesName(name, '--output-directory'))
    ) {
      if (value.length > 0) out.push(value.join('='));
      else if (args[i + 1] !== undefined) out.push(args[i + 1] as string);
    } else if (a === '-o' && args[i + 1] !== undefined) {
      out.push(args[i + 1] as string);
    } else if (/^-o.+/.test(a) && !a.startsWith('--')) {
      out.push(a.slice(2));
    }
  }
  return out;
}

/** Concrete protected paths a shell glob could expand to (already normalised). */
const PROTECTED_NAMES = [
  '.env',
  '.env.local',
  '.env.production',
  'id_rsa',
  'id_ed25519',
  '.ssh',
  '.aws',
  '.npmrc',
  '.claude',
  '.claude.json',
  '.codex',
  '.forge',
  '.forge/data',
];

function globRegex(segment: string): RegExp {
  let src = '';
  for (const ch of segment) {
    if (ch === '*') src += '[^/]*';
    else if (ch === '?') src += '[^/]';
    else src += /[\\^$.+()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
  }
  return new RegExp(`^${src}$`);
}

/**
 * True when `arg` contains a wildcard and could expand to a protected name. A bare `*` is
 * left alone (it does not match dotfiles in POSIX shells and is everyday usage); a wildcard
 * with at least one literal character besides dots in the last segment is matched against the protected names.
 */
export function wildcardHitsFloor(arg: string): boolean {
  if (!/[*?[]/.test(arg)) return false;
  const norm = normalizePath(arg.replaceAll('[', '?').replaceAll(']', '?'));
  const segs = norm.split('/').filter((s) => s !== '');
  const last = segs[segs.length - 1];
  if (last === undefined || !/[*?]/.test(last) || /^[*?.]+$/.test(last)) return false;
  const tail2 = segs.slice(-2).join('/');
  const re2 = globRegex(tail2);
  const re1 = globRegex(last);
  return PROTECTED_NAMES.some((n) => re1.test(n) || re2.test(n));
}

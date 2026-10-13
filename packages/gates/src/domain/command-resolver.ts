/**
 * Command resolver — turns a project command into one that cannot run Worker-planted code.
 *
 * Why: G1 re-runs `pnpm test` and friends in the Worker's worktree through the Windows
 *   shell, and cmd.exe looks in the current directory before PATH. A Worker that commits
 *   `pnpm.cmd` containing `@exit /b 0` would make every check pass. This resolves the
 *   command's first token to an absolute executable using PATH and PATHEXT only (never the
 *   cwd, never a relative PATH entry) and refuses any result inside the worktree, so the
 *   runner spawns the real tool or nothing. Later segments (`a && b`) are left to the
 *   shell; the runner sets `NoDefaultCurrentDirectoryInExePath` and config-guard flags any
 *   executable the Worker adds.
 *
 * Exports: resolveCommand().
 * Depends on: node:path (pure path maths), types/command-resolver. No IO; the file probe is injected.
 */

import { posix, win32 } from 'node:path';
import type { ResolveResult, ResolveSeam } from '#/types/command-resolver.types.js';

/** Builtins and assignments the shell handles itself; there is no file to resolve. */
const SHELL_WORDS = new Set([
  'cd',
  'echo',
  'set',
  'exit',
  'pushd',
  'popd',
  'rem',
  'true',
  'false',
  'export',
]);

const FIRST_TOKEN = /^(\s*)(?:"([^"]*)"|(\S+))/;
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

function envGet(env: ResolveSeam['env'], name: string): string | undefined {
  const wanted = name.toUpperCase();
  const key = Object.keys(env).find((k) => k.toUpperCase() === wanted);

  return key === undefined ? undefined : env[key];
}

function isInside(file: string, dir: string, platform: ResolveSeam['platform']): boolean {
  const p = platform === 'win32' ? win32 : posix;
  const rel = p.relative(p.resolve(dir), p.resolve(file));
  const folded = platform === 'win32' ? rel.toLowerCase() : rel;

  return folded === '' || (!folded.startsWith('..') && !p.isAbsolute(folded));
}

function candidates(name: string, seam: ResolveSeam): string[] {
  if (seam.platform !== 'win32') {
    return [name];
  }

  const exts = (envGet(seam.env, 'PATHEXT') ?? DEFAULT_PATHEXT)
    .split(';')
    .filter((e) => e.length > 0);

  const hasExt = exts.some((e) => name.toLowerCase().endsWith(e.toLowerCase()));

  return hasExt ? [name, ...exts.map((e) => name + e)] : exts.map((e) => name + e);
}

function search(name: string, seam: ResolveSeam): string | null {
  const p = seam.platform === 'win32' ? win32 : posix;
  const dirs = (envGet(seam.env, 'PATH') ?? '')
    .split(seam.platform === 'win32' ? ';' : ':')
    .map((d) => d.trim().replace(/^"(.*)"$/, '$1'))
    // An empty or relative entry means "the cwd" to the shell: exactly what we must avoid.
    .filter((d) => d.length > 0 && p.isAbsolute(d));

  for (const dir of dirs) {
    for (const file of candidates(name, seam)) {
      const full = p.join(dir, file);
      if (seam.isFile(full)) {
        return full;
      }
    }
  }

  return null;
}

function resolveToken(token: string, seam: ResolveSeam): ResolveResult {
  const p = seam.platform === 'win32' ? win32 : posix;
  const hasSeparator = /[\\/]/.test(token);
  if (hasSeparator && !p.isAbsolute(token)) {
    return {
      ok: false,
      reason: `relative command path "${token}" would run from inside the worktree`,
    };
  }

  const found = hasSeparator
    ? (candidates(token, seam).find((c) => seam.isFile(c)) ?? null)
    : search(token, seam);

  if (found === null) {
    return { ok: false, reason: `command "${token}" not found on PATH` };
  }

  if (isInside(found, seam.cwd, seam.platform)) {
    return {
      ok: false,
      reason: `command "${token}" resolves to ${found}, inside the worktree; refusing to run Worker-controlled code`,
    };
  }

  return { ok: true, command: found };
}

/**
 * Rewrites `command` so its first token is an absolute, quoted executable outside the
 * worktree. Builtins and `NAME=value` prefixes pass through untouched.
 */
export function resolveCommand(command: string, seam: ResolveSeam): ResolveResult {
  const m = FIRST_TOKEN.exec(command);
  const token = m?.[2] ?? m?.[3];
  if (!m || token === undefined || token === '') {
    return { ok: false, reason: 'empty command' };
  }

  if (SHELL_WORDS.has(token.toLowerCase()) || /^\w+=/.test(token)) {
    return { ok: true, command };
  }

  const out = resolveToken(token, seam);
  if (!out.ok) {
    return out;
  }

  return { ok: true, command: `"${out.command}"${command.slice(m[0].length)}` };
}

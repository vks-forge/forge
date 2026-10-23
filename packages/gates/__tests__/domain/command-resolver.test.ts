/**
 * Command resolver tests — pin that a project command never resolves from the worktree.
 *
 * Why: Windows cmd.exe looks in the current directory before PATH, so a Worker that commits
 *   `pnpm.cmd` (`@exit /b 0`) would make every check pass. The resolver finds the
 *   executable on PATH itself and refuses anything that lands inside the Worker's tree.
 *
 * Pins: PATH+PATHEXT search order, cwd and relative PATH entries ignored, refusal when the
 *   only hit is inside the worktree, relative and absolute path tokens, builtin and
 *   env-assignment pass-through, rewriting only the first token and keeping the tail, and the
 *   one exception: a listed tool folder inside the worktree (`.venv/Scripts`) for setup steps.
 * Depends on: domain/command-resolver.
 */

import { describe, expect, it } from 'vitest';
import { resolveCommand } from '#/domain/command-resolver.js';
import type { ResolveSeam } from '#/types/command-resolver.types.js';

/** Writes Windows paths with `/` in the source and converts, so no escape can go wrong. */
const w = (p: string): string => p.replaceAll('/', '\\');

function seam(files: string[], over: Partial<ResolveSeam> = {}): ResolveSeam {
  const set = new Set(files.map((f) => w(f).toLowerCase()));

  return {
    platform: 'win32',
    cwd: w('C:/wt'),
    env: { Path: w('C:/tools;;.;C:/bin'), PATHEXT: '.COM;.EXE;.BAT;.CMD' },
    isFile: (p) => set.has(p.toLowerCase()),
    ...over,
  };
}

describe('resolveCommand', () => {
  it('resolves the first token through PATH and PATHEXT and keeps the rest', () => {
    const out = resolveCommand('pnpm -r test && echo ok', seam(['C:/bin/pnpm.cmd']));

    expect(out).toEqual({
      ok: true,
      command: `"${w('C:/bin/pnpm.CMD')}" -r test && echo ok`,
    });
  });

  it('never looks in the cwd, even when the worktree holds the same name', () => {
    const out = resolveCommand('pnpm test', seam(['C:/wt/pnpm.cmd', 'C:/bin/pnpm.cmd']));

    expect(out).toEqual({ ok: true, command: `"${w('C:/bin/pnpm.CMD')}" test` });
  });

  it('prefers earlier PATH directories and earlier PATHEXT entries', () => {
    const out = resolveCommand(
      'tool',
      seam(['C:/bin/tool.exe', 'C:/tools/tool.cmd', 'C:/tools/tool.exe']),
    );

    expect(out).toEqual({ ok: true, command: `"${w('C:/tools/tool.EXE')}"` });
  });

  it('refuses when the only match is inside the worktree via PATH', () => {
    const out = resolveCommand(
      'pnpm test',
      seam(['C:/wt/node_modules/.bin/pnpm.cmd'], {
        env: { PATH: w('C:/wt/node_modules/.bin'), PATHEXT: '.CMD' },
      }),
    );

    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toContain('inside the worktree');
  });

  it('runs a tool from a folder the owner listed as a tool folder, and still refuses other worktree folders', () => {
    const files = [
      'C:/wt/.venv/Scripts/python.exe',
      'C:/wt/node_modules/.bin/python.exe',
    ];

    const env = { PATH: w('C:/wt/.venv/Scripts'), PATHEXT: '.EXE' };

    const listed = resolveCommand(
      'python -m pip install -e .',
      seam(files, { env, trustedDirs: [w('C:/wt/.venv/Scripts')] }),
    );

    const other = resolveCommand(
      'python -m pip install -e .',
      seam(files, {
        env: { ...env, PATH: w('C:/wt/node_modules/.bin') },
        trustedDirs: [w('C:/wt/.venv/Scripts')],
      }),
    );

    expect(listed).toEqual({
      ok: true,
      command: `"${w('C:/wt/.venv/Scripts/python.EXE')}" -m pip install -e .`,
    });

    expect(other.ok).toBe(false);
  });

  it('refuses a name found nowhere, and a relative path token', () => {
    const missing = resolveCommand('nope', seam([]));
    const relative = resolveCommand('./pnpm.cmd test', seam(['C:/wt/pnpm.cmd']));
    const dotted = resolveCommand('scripts/run.sh', seam([], { platform: 'posix' }));

    expect(missing.ok).toBe(false);
    expect(relative.ok).toBe(false);
    expect(dotted.ok).toBe(false);
  });

  it('accepts an absolute path outside the worktree and refuses one inside', () => {
    const outside = resolveCommand(
      `${w('C:/bin/pnpm.cmd')} test`,
      seam(['C:/bin/pnpm.cmd']),
    );

    const inside = resolveCommand(`"${w('C:/wt/x.exe')}" a`, seam(['C:/wt/x.exe']));

    expect(outside.ok).toBe(true);
    expect(inside.ok).toBe(false);
  });

  it('uses : separators and exact names on posix', () => {
    const out = resolveCommand('pnpm test', {
      platform: 'posix',
      cwd: '/wt',
      env: { PATH: '/wt/bin:/usr/bin' },
      isFile: (p) => p === '/usr/bin/pnpm',
    });

    expect(out).toEqual({ ok: true, command: '"/usr/bin/pnpm" test' });
  });

  it('passes shell builtins and env assignments through unchanged', () => {
    expect(resolveCommand('cd pkg && pnpm test', seam([]))).toEqual({
      ok: true,
      command: 'cd pkg && pnpm test',
    });

    expect(resolveCommand('CI=1 vitest', seam([], { platform: 'posix' }))).toMatchObject({
      ok: true,
    });
  });
});

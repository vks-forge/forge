/**
 * Path resolver — the physical twin of a path tool call, for the hook's second policy look.
 *
 * Why: the path floors in `@forge/tools` are lexical (that package has no IO). A Worker can
 *   make a junction or symlink inside its own worktree that points at Forge's data home
 *   (`<worktree>/link/forge.db`), or name the data home by an 8.3 short name; the lexical
 *   path then looks harmless. The hook handler is the one place with IO, so before `admit()`
 *   it resolves each path argument of a path tool (`file_path`, `path`, `notebook_path`) with
 *   `fs.realpathSync.native` (which also expands Windows short names), using the nearest
 *   existing parent for a file that does not exist yet, and judges the call a second time
 *   with those physical paths, the physical worktree and the physical data home. The caller
 *   denies when either look denies. A path that cannot be resolved for a reason other than
 *   "does not exist" (permissions, a symlink loop) is refused, never guessed. Shell command
 *   lines are not resolved: their argv is text the shell expands later, so the floor on a
 *   shell call stays lexical (see the tools README, Limits).
 *
 * Exports: physicalView().
 * Depends on: node:fs, node:path, @forge/tools (AdmitContext, AdmitCall types). IO: stats the
 *   filesystem, read-only.
 */

import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { AdmitCall, AdmitContext } from '@forge/tools';
import type { PhysicalView } from '#/types/path-resolver.types.js';

const PATH_FIELDS = ['file_path', 'path', 'notebook_path'] as const;
const MAX_CLIMB = 64;

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');

/** `realpath` of `p`, or of its nearest existing ancestor with the missing tail re-attached. */
function realOrParent(p: string): string {
  let current = p;
  let tail = '';
  for (let i = 0; i < MAX_CLIMB; i++) {
    try {
      const real = realpathSync.native(current);

      return tail === '' ? real : join(real, tail);
    } catch (e) {
      const parent = dirname(current);
      if (!isMissing(e) || parent === current) {
        throw e;
      }

      tail = tail === '' ? basename(current) : join(basename(current), tail);
      current = parent;
    }
  }

  throw new Error('path has too many missing parents');
}

/** Resolves `dir` when it exists; an unknown or relative value is kept for admit to refuse. */
function physicalDir(dir: string | undefined): string | undefined {
  if (dir === undefined || !isAbsolute(dir)) {
    return dir;
  }

  try {
    return realOrParent(dir);
  } catch {
    return dir;
  }
}

/**
 * The same call with every path argument, the cwd and the data home resolved physically.
 * `none` when the call has no path argument to resolve. The cwd and data home are resolved too,
 * so a data home named through a junction or short name still matches the physical path.
 */
export function physicalView(ctx: AdmitContext, call: AdmitCall): PhysicalView {
  const input = call.input;
  if (input === undefined) {
    return { kind: 'none' };
  }

  const resolved: Record<string, unknown> = { ...input };
  let present = false;
  for (const field of PATH_FIELDS) {
    const value = input[field];
    // A non-string or empty path is already a denial in `admit()`.
    if (typeof value !== 'string' || value.trim() === '') {
      continue;
    }

    present = true;
    if (!isAbsolute(value) && ctx.cwd === undefined) {
      continue;
    }

    try {
      const abs = isAbsolute(value) ? value : resolve(ctx.cwd as string, value);
      const real = realOrParent(abs);
      resolved[field] = real;
    } catch {
      return { kind: 'refuse' };
    }
  }

  if (!present) {
    return { kind: 'none' };
  }

  const cwd = physicalDir(ctx.cwd);
  const dataHome = physicalDir(ctx.grant.dataHome) ?? ctx.grant.dataHome;
  const physical: AdmitContext = {
    ...ctx,
    ...(cwd === undefined ? {} : { cwd }),
    grant: { ...ctx.grant, dataHome },
  };

  return { kind: 'view', ctx: physical, call: { ...call, input: resolved } };
}

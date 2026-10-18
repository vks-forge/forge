/**
 * Finds the memory folder the `forge memory` commands read.
 *
 * Why: a session runs from some folder inside the Forge checkout, not necessarily its root, and must read this
 *   repository's own records, never another project's: the folder is the first `.forge/memory` found walking up
 *   from the current folder, else the one under `FORGE_ROOT`, and `--dir` names one outright. Nothing else is
 *   guessed, so an unrelated `.forge/memory` somewhere else on the machine is never read by accident, and a
 *   missing folder says where it looked.
 *
 * Exports: findMemoryDir().
 * Depends on: node:path, @forge/core (InvalidInputError), types/cli. IO: through the `isDir` port only.
 */

import { dirname, join, resolve } from 'node:path';
import { InvalidInputError } from '@forge/core';
import type { MemoryCliPorts } from '#/types/cli.types.js';

const SUB = ['.forge', 'memory'] as const;

/** The memory folder to read; throws InvalidInputError saying where it looked when there is none. */
export async function findMemoryDir(
  ports: Pick<MemoryCliPorts, 'cwd' | 'env' | 'isDir'>,
  explicit?: string,
): Promise<string> {
  if (explicit !== undefined) {
    const dir = resolve(ports.cwd, explicit);
    if (!(await ports.isDir(dir))) {
      throw new InvalidInputError(`--dir ${explicit} is not a folder`);
    }

    return dir;
  }

  let current = resolve(ports.cwd);
  for (;;) {
    const candidate = join(current, ...SUB);
    if (await ports.isDir(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  const root = ports.env['FORGE_ROOT'];
  if (root !== undefined && root !== '') {
    const candidate = join(resolve(root), ...SUB);
    if (await ports.isDir(candidate)) {
      return candidate;
    }
  }

  throw new InvalidInputError(
    `no .forge/memory found above ${ports.cwd}; run from the Forge checkout, set FORGE_ROOT or pass --dir`,
  );
}

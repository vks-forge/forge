/**
 * Finds the data home on this machine and lays out the folders under it.
 *
 * Why: `forge secret wrap` must encrypt a key into the same folder the server later reads
 *   its secrets from, whatever directory the user runs it in (d-0098); the old walk up to a
 *   `.forge` directory only worked inside a repository. The rule that picks the folder is
 *   pure and lives in `@forge/core` so the CLI and the server agree; this file adds the only
 *   IO it needs (a twin of the server's `config/data-home.ts`, since apps never import each
 *   other):
 *   reading the bootstrap file `forge-home.json` when the user chose another disk. `FORGE_HOME`
 *   (development and tests only) wins over the file and the default, and when it is set the
 *   bootstrap file is not even read, so a test never depends on the developer's real choice.
 *
 * Exports: loadDataHome(), nodeDataHomeIo.
 * Depends on: node:fs/promises, node:os, @forge/core (resolveDataHome, dataHomeLayout,
 *   bootstrapFilePath, parseBootstrapFile), types/data-home. IO: reads one small file.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  bootstrapFilePath,
  dataHomeLayout,
  parseBootstrapFile,
  resolveDataHome,
} from '@forge/core';
import type { DataHomeLayout } from '@forge/core';
import type { DataHomeIo } from '#/types/data-home.types.js';

/** The real machine. */
export const nodeDataHomeIo: DataHomeIo = {
  platform: process.platform,
  homedir: homedir(),
  readText: async (path) => {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }

      throw error;
    }
  },
};

/** Resolves the data home from the environment and the bootstrap file; throws InvalidInputError on a bad choice. */
export async function loadDataHome(
  env: Readonly<Record<string, string | undefined>>,
  io: DataHomeIo = nodeDataHomeIo,
): Promise<DataHomeLayout> {
  const base = { platform: io.platform, env, homedir: io.homedir };
  const forced = env['FORGE_HOME'] !== undefined && env['FORGE_HOME'] !== '';
  const text = forced ? undefined : await io.readText(bootstrapFilePath(base));
  const bootstrapHome =
    text === undefined ? undefined : parseBootstrapFile(text, io.platform);

  return dataHomeLayout(resolveDataHome({ ...base, bootstrapHome }), io.platform);
}

#!/usr/bin/env node
/**
 * forge — entry of the Forge command-line client.
 *
 * Why: the user needs a terminal door for setup tasks that must not go through the server,
 *   such as encrypting the GitHub App key into the DPAPI store before the server ever runs.
 *   This file only composes: it finds the repository root, builds the real ports (disk,
 *   DPAPI store under `.forge/data/secrets`, stdio) and hands them to `runCli`.
 *
 * Exports: none (executable).
 * Depends on: node:fs, node:path, @forge/secrets, services/run-cli.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createDpapiSecretStore } from '@forge/secrets';
import { runCli } from '#/services/run-cli.js';

/** Nearest ancestor of `start` that holds a `.forge` directory. */
function findRepoRoot(start: string): string {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.forge'))) {
      return dir;
    }

    if (dirname(dir) === dir) {
      throw new Error('run forge inside a Forge repository (no .forge directory found)');
    }
  }
}

process.exitCode = await runCli(process.argv.slice(2), {
  openStore: async () =>
    createDpapiSecretStore({
      dir: join(findRepoRoot(process.cwd()), '.forge', 'data', 'secrets'),
    }),
  readFile: async (path) => new Uint8Array(await readFile(path)),
  resolvePath: (path) => resolve(path),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});

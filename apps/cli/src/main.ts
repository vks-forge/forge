#!/usr/bin/env node
/**
 * forge — entry of the Forge command-line client.
 *
 * Why: the user needs a terminal door for setup tasks that must not go through the server,
 *   such as encrypting the GitHub App key into the DPAPI store before the server ever runs.
 *   This file only composes: it finds Forge's data home (the same folder the server uses,
 *   whatever directory the command is run from), builds the real ports (disk, DPAPI store
 *   under `<dataHome>/secrets`, stdio) and hands them to `runCli`.
 *
 * Exports: none (executable).
 * Depends on: node:fs/promises, node:path, @forge/secrets, services/data-home, services/run-cli.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDpapiSecretStore } from '@forge/secrets';
import { loadDataHome } from '#/services/data-home.js';
import { runCli } from '#/services/run-cli.js';

process.exitCode = await runCli(process.argv.slice(2), {
  openStore: async () =>
    createDpapiSecretStore({ dir: (await loadDataHome(process.env)).secretsDir }),
  readFile: async (path) => new Uint8Array(await readFile(path)),
  resolvePath: (path) => resolve(path),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});

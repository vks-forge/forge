#!/usr/bin/env node
/**
 * forge — entry of the Forge command-line client.
 *
 * Why: the user needs a terminal door for setup tasks that must not go through the server,
 *   such as encrypting the GitHub App key into the DPAPI store before the server ever runs,
 *   and for running Forge itself in the background (`forge start | status | stop`). This file
 *   only composes: it finds Forge's data home (the same folder the server uses, whatever
 *   directory the command is run from), builds the real ports (disk, DPAPI store under
 *   `<dataHome>/secrets`, stdio, the daemon ports that spawn and call the server) and hands
 *   them to `runCli`.
 *
 * Exports: none (executable).
 * Depends on: node:fs/promises, node:path, @forge/secrets, services/data-home,
 *   services/node-daemon-ports, services/run-cli, services/memory-index-open (loaded only by `forge memory`).
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDpapiSecretStore } from '@forge/secrets';
import { loadDataHome } from '#/services/data-home.js';
import { createNodeDaemonPorts } from '#/services/node-daemon-ports.js';
import { runCli } from '#/services/run-cli.js';

const stdout = (text: string): boolean => process.stdout.write(text);
const stderr = (text: string): boolean => process.stderr.write(text);

process.exitCode = await runCli(process.argv.slice(2), {
  openStore: async () =>
    createDpapiSecretStore({ dir: (await loadDataHome(process.env)).secretsDir }),
  readFile: async (path) => new Uint8Array(await readFile(path)),
  resolvePath: (path) => resolve(path),
  stdout,
  stderr,
  daemon: createNodeDaemonPorts({ stdout, stderr }),
  memory: {
    cwd: process.cwd(),
    env: process.env,
    isDir: async (path) =>
      (await stat(path).catch(() => undefined))?.isDirectory() === true,
    // The index loads the database package; only a memory command pays for it.
    openIndex: async (dir) =>
      (await import('#/services/memory-index-open.js')).openLocalMemoryIndex(dir),
  },
});

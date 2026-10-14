#!/usr/bin/env node
/**
 * move-dev-data — one-off helper that moves this repo's old `.forge/data/*` into the dev
 * data home.
 *
 * Why: before B1 the server kept its database, per-run folders and encrypted secrets in
 * `<repo>/.forge/data`. They now live in the data home (`%LOCALAPPDATA%\Forge` on Windows,
 * or `FORGE_HOME`). A developer with an existing database and a stored GitHub App key would
 * otherwise start with an empty home and lose both. This script moves them, and only that:
 * the `probes/` artefact folder stays where it is, and nothing is touched without `--apply`.
 *
 * Usage:
 *   node scripts/move-dev-data.mjs            dry run: prints what would move
 *   node scripts/move-dev-data.mjs --apply    performs the moves
 * Stop the server first (an open SQLite file cannot be moved safely). The target home is
 * `FORGE_HOME` if set, else the platform default; an entry that already exists in the
 * target is never overwritten (the script stops and says so).
 *
 * Exports: none (executable).
 * Depends on: node:fs, node:os, node:path, node:url. IO: reads the old folder, moves files.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOVE = new Set(['forge.db', 'forge.db-wal', 'forge.db-shm', 'runs', 'secrets']);

function dataHome() {
  const forced = process.env.FORGE_HOME;
  if (forced) {
    if (!isAbsolute(forced)) {
      throw new Error(`FORGE_HOME must be an absolute path, got "${forced}"`);
    }

    return resolve(forced);
  }

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');

    return join(local, 'Forge');
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Forge');
  }

  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'forge');
}

/** Moves `from` to `to`; falls back to copy then remove when they are on different drives. */
function move(from, to) {
  try {
    renameSync(from, to);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }

    cpSync(from, to, { recursive: true, errorOnExist: true });
    rmSync(from, { recursive: true, force: true });
  }
}

const apply = process.argv.includes('--apply');
const repo = fileURLToPath(new URL('..', import.meta.url));
const source = join(repo, '.forge', 'data');
const target = dataHome();

if (!existsSync(source)) {
  console.log(`nothing to move: ${source} does not exist`);
  process.exit(0);
}

const entries = readdirSync(source).filter((name) => MOVE.has(name));
if (entries.length === 0) {
  console.log(`nothing to move: ${source} holds none of ${[...MOVE].join(', ')}`);
  process.exit(0);
}

const clashes = entries.filter((name) => existsSync(join(target, name)));
console.log(`${apply ? 'moving' : 'dry run, would move'} from ${source} to ${target}`);
for (const name of entries) {
  console.log(
    `  ${name}${clashes.includes(name) ? '   <- already exists in the target' : ''}`,
  );
}

if (clashes.length > 0) {
  console.error('refusing to overwrite; remove or rename the clashing entries first');
  process.exit(1);
}

if (!apply) {
  console.log('dry run only; re-run with --apply to move');
  process.exit(0);
}

mkdirSync(target, { recursive: true });
for (const name of entries) {
  move(join(source, name), join(target, name));
}

console.log('done');

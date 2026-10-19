/**
 * Development loop (`pnpm dev`): hot reload for the web app and the server side.
 *
 * Why: a developer editing Forge changes UI files and server or package code in the same
 *   sitting. Restarting the server by hand after every server-side edit, then signing the
 *   browser in again, breaks the flow. This runs one TypeScript watch build, the server
 *   under Node's watch mode (it restarts when a compiled file changes) and the Vite dev
 *   server (instant UI reload; it reads the install token on every request, so a server
 *   restart needs no sign-in). A background daemon from `forge start` would hold the
 *   port, so it is stopped first. Ctrl+C takes the whole tree down.
 *
 * Exports: none (script). Env: FORGE_HOME and FORGE_PORT pass through to every child.
 * Depends on: node:child_process, node:fs, node:module, node:path, typescript and vite
 *   (their bin files), apps/cli/dist (daemon stop). IO: spawns the children, may stop the
 *   background daemon.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const isWindows = process.platform === 'win32';

const binEntry = (fromDir, pkg, name = pkg) => {
  const manifest = createRequire(resolve(fromDir, 'package.json')).resolve(
    `${pkg}/package.json`,
  );

  const bin = require(manifest).bin;

  return join(dirname(manifest), typeof bin === 'string' ? bin : bin[name]);
};

const tsc = binEntry('.', 'typescript', 'tsc');
const cliMain = join('apps', 'cli', 'dist', 'main.js');
const serverMain = join('apps', 'server', 'dist', 'main.js');

// 1. A background daemon owns the port; stop it so dev can take over.
if (existsSync(cliMain)) {
  const status = spawnSync(process.execPath, [cliMain, 'status'], { stdio: 'ignore' });

  if (status.status === 0) {
    console.log(
      '[dev] a background Forge daemon is running; stopping it so dev can own the port',
    );

    spawnSync(process.execPath, [cliMain, 'stop'], { stdio: 'inherit' });
  }
}

// 2. One full build so the server starts from complete output; fail fast.
const build = spawnSync(process.execPath, [tsc, '-b'], { stdio: 'inherit' });

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// 3. Long-running children with prefixed, coloured output.
const children = [];
let stopping = false;
let exitCode = 0;

const killTree = (child) => {
  if (child.exitCode !== null || child.pid === undefined) {
    return;
  }

  if (isWindows) {
    // No process groups on Windows; `node --watch` and vite both have their own children.
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
};

const shutdown = (code) => {
  if (stopping) {
    return;
  }

  stopping = true;
  exitCode = code;

  for (const child of children) {
    killTree(child);
  }
};

const prefixLines = (label, color, stream, sink) => {
  let pending = '';

  const emit = (line) => sink.write(`\u001b[${color}m[${label}]\u001b[0m ${line}\n`);

  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (pending + chunk).split(/\r?\n/);

    pending = lines.pop() ?? '';
    lines.forEach(emit);
  });

  stream.on('end', () => {
    if (pending !== '') {
      emit(pending);
    }
  });
};

const run = (label, color, args, cwd) => {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  children.push(child);
  prefixLines(label, color, child.stdout, process.stdout);
  prefixLines(label, color, child.stderr, process.stderr);
  child.on('error', (error) => {
    console.error(`[dev] ${label} failed to start: ${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[dev] ${label} exited (${signal ?? code}); stopping the rest`);
      shutdown(code && code !== 0 ? code : 1);
    }
  });
};

run('tsc', '36', [tsc, '-b', '--watch', '--preserveWatchOutput'], process.cwd());
// Node's watch follows the module graph, and tsc rewrites several files per edit;
// it debounces those into one restart.
run('server', '35', ['--watch', '--watch-preserve-output', serverMain], process.cwd());
run('web', '32', [binEntry(join('apps', 'web'), 'vite')], join('apps', 'web'));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

process.on('exit', () => {
  children.forEach(killTree);
  process.exitCode = exitCode;
});

console.log(
  '[dev] open http://127.0.0.1:5173 (no sign-in needed); Ctrl+C stops everything',
);

/**
 * A real Forge server on a temporary data home, seeded through its HTTP API, for the browser smoke.
 *
 * Why: the web app talks only to the real server API (d-0123), so the smoke must too, or it
 *   would prove nothing about the contract between the two. This starts `apps/server/dist/main.js`
 *   with `FORGE_HOME` pointing at a fresh temp folder and a free port (both dev and test
 *   switches, code.md rule 9), waits for `/health`, reads the install token the server wrote,
 *   and registers two throwaway git repositories as projects and files one chat request in
 *   each, all through the same HTTP API the app uses. The token stays in this Node process and
 *   in the preview proxy's header injection; it is never handed to a page. No Claude Code is
 *   configured, so nothing here can start a Worker: screens that need a running Worker show
 *   their empty state.
 *
 * Exports: startRealForge(), RealForge, SEED.
 * Depends on: node:child_process, node:fs, node:net, node:os, node:path. IO: spawns the server
 *   and git, writes under the OS temp directory (removed by `stop()`).
 */

import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** What the smoke expects to find after seeding. */
export const SEED = {
  projects: [
    { slug: 'sample-service', prefix: 'SVC' },
    { slug: 'sample-web', prefix: 'WEB' },
  ],
  /** The first ticket in each project, filed through chat intake. */
  firstTicketText: 'Fix off-by-one in the nightly report',
  /** Triage titles the ticket; with no Claude Code it parks in "Needs you" (lane not enabled). */
  ticketTitleStart: 'Fix off-by-one',
} as const;

export interface RealForge {
  /** Loopback port the server listens on. */
  readonly port: number;
  /** The data home the server uses; temporary. */
  readonly home: string;
  /** Stops the server and removes every temporary folder. */
  stop(): Promise<void>;
}

const SERVER_MAIN = resolve(import.meta.dirname, '../../../server/dist/main.js');
const BOOT_TIMEOUT_MS = 60_000;

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address
          ? resolvePort(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true, stdio: 'ignore' });
}

/** A one-commit repository with a bare "remote" next to it, ready for `POST /projects`. */
function makeRepository(base: string, name: string): { root: string; remote: string } {
  const root = join(base, name);
  const remote = join(base, `${name}-remote.git`);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      private: true,
      scripts: { test: 'node --test' },
    }),
  );

  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'E2E');
  git(root, 'config', 'user.email', 'e2e@localhost');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'initial commit');
  mkdirSync(remote, { recursive: true });
  git(remote, 'init', '--bare', '-b', 'main');
  git(root, 'push', remote, 'main');

  return { root, remote };
}

async function waitForHealth(
  port: number,
  child: ChildProcess,
  log: string,
): Promise<void> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `The Forge server exited early (code ${child.exitCode}):
${readFileSync(log, 'utf8').slice(-2000)}`,
      );
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(
    `The Forge server did not answer /health in ${BOOT_TIMEOUT_MS / 1000} s. Log: ${log}`,
  );
}

async function call(
  port: number,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    throw new Error(
      `${method} ${path} answered ${response.status}: ${await response.text()}`,
    );
  }
}

export async function startRealForge(): Promise<RealForge> {
  const base = mkdtempSync(join(tmpdir(), 'forge-e2e-'));
  const home = join(base, 'home');
  const forgeRoot = join(base, 'root');
  mkdirSync(forgeRoot, { recursive: true });
  const port = await freePort();
  const log = join(base, 'server.log');
  const logFd = openSync(log, 'w');
  const child = spawn(process.execPath, [SERVER_MAIN], {
    cwd: forgeRoot,
    env: {
      ...process.env,
      FORGE_HOME: home,
      FORGE_ROOT: forgeRoot,
      FORGE_PORT: String(port),
    },
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });

  const stop = async (): Promise<void> => {
    if (child.exitCode === null) {
      const exited = new Promise<void>((done) => child.once('exit', () => done()));
      try {
        const token = readFileSync(join(home, 'install-token'), 'utf8').trim();
        await call(port, token, 'POST', '/admin/shutdown');
      } catch {
        child.kill();
      }

      await Promise.race([exited, new Promise((r) => setTimeout(r, 20_000))]);
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }

    closeSync(logFd);
    try {
      rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      // Windows may hold a handle for a moment; a leftover temp folder must not fail the run.
      process.stderr.write(`e2e cleanup: ${base} not removed (${String(error)})
`);
    }
  };

  try {
    await waitForHealth(port, child, log);
    const token = readFileSync(join(home, 'install-token'), 'utf8').trim();
    for (const { slug, prefix } of SEED.projects) {
      const repo = makeRepository(base, slug);
      await call(port, token, 'POST', '/projects', {
        slug,
        prefix,
        local_path: repo.root,
        base_branch: 'main',
        git_host: { kind: 'local', remote_path: repo.remote, base_branch: 'main' },
        settings: {
          checks: [{ name: 'test', role: 'test', command: 'npm test' }],
          default_harness: 'claude-code',
        },
        author: 'e2e',
        reason: 'seeded by the browser smoke',
      });

      await call(port, token, 'POST', '/intake', {
        source: 'chat',
        kind: 'new_request',
        dedupe_key: `e2e-${slug}-1`,
        actor: { type: 'user', id: 'e2e' },
        project: slug,
        payload: { text: SEED.firstTicketText },
        received_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    await stop();
    throw error;
  }

  return { port, home, stop };
}

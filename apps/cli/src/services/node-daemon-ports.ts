/**
 * The real machine behind the daemon commands: files, loopback HTTP, processes.
 *
 * Why: `forge start` must leave a server running after the terminal closes, so the spawn is
 *   detached with no console window and its output goes to a log file in the data home (a
 *   closed terminal would otherwise break the pipes and kill the server on its next write).
 *   The CLI starts the server's built entry as a program and never imports server code
 *   (apps do not import each other, code.md rule 1); the entry is found next to this app in
 *   the workspace, or at `FORGE_SERVER_ENTRY`. Health and stop talk to 127.0.0.1 only, with
 *   short timeouts, so a hung server cannot hang the CLI. `/health` is accepted as Forge's
 *   only when it says `service: forge`, so another program on the port is never mistaken
 *   for it or sent the install token.
 *
 * Exports: createNodeDaemonPorts(), defaultServerEntry().
 * Depends on: node:child_process, node:fs, node:fs/promises, node:path, node:url, @forge/core,
 *   services/data-home, types/daemon. IO: spawns the server, HTTP to loopback, log file.
 */

import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ForgeError } from '@forge/core';
import type { DataHomeLayout } from '@forge/core';
import { loadDataHome, nodeDataHomeIo } from '#/services/data-home.js';
import type { DaemonPorts, HealthState, Output } from '#/types/daemon.types.js';

const HTTP_TIMEOUT_MS = 2_000;

/** `apps/server/dist/main.js`, found relative to this module (src/ or dist/, same depth). */
export function defaultServerEntry(moduleUrl: string = import.meta.url): string {
  return fileURLToPath(new URL('../../../server/dist/main.js', moduleUrl));
}

async function health(port: number): Promise<HealthState> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    const body = (await res.json()) as { service?: unknown; status?: unknown };
    if (body.service !== 'forge') {
      return 'not_forge';
    }

    return res.status === 200 && body.status === 'ok' ? 'ok' : 'degraded';
  } catch (error) {
    // A reply that is not JSON is some other program; no reply at all is "nothing there".
    return error instanceof SyntaxError ? 'not_forge' : 'unreachable';
  }
}

async function shutdown(port: number, token: string): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${port}/admin/shutdown`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  return res.status;
}

async function readLogFrom(path: string, offset: number): Promise<string> {
  try {
    const handle = await open(path, 'r');
    try {
      const size = (await handle.stat()).size;
      const buffer = Buffer.alloc(Math.max(0, size - offset));
      await handle.read(buffer, 0, buffer.length, offset);

      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return '';
  }
}

/** Ports for the real machine; `entry` and `env` are overridable for tests. */
export function createNodeDaemonPorts(
  io: Output,
  env: Readonly<Record<string, string | undefined>> = process.env,
  entry: string = env['FORGE_SERVER_ENTRY'] || defaultServerEntry(),
): DaemonPorts {
  let layout: Promise<DataHomeLayout> | undefined;

  return {
    ...io,
    layout: () => (layout ??= loadDataHome(env)),
    readText: nodeDataHomeIo.readText,
    health,
    shutdown,
    async spawnServer() {
      if (!existsSync(entry)) {
        throw new ForgeError(
          'crash',
          `the server is not built (${entry} is missing); run \`pnpm build\` first`,
        );
      }

      const { logsDir } = await (layout ??= loadDataHome(env));
      await mkdir(logsDir, { recursive: true });
      const logPath = join(logsDir, 'server.log');
      const logStart = await stat(logPath).then(
        (info) => info.size,
        () => 0,
      );

      const fd = openSync(logPath, 'a');
      try {
        const child = spawn(process.execPath, [entry], {
          detached: true,
          windowsHide: true,
          stdio: ['ignore', fd, fd],
          env: { ...process.env, ...env },
        });

        child.on('error', () => undefined);
        child.unref();
        if (child.pid === undefined) {
          throw new ForgeError('crash', `could not start ${process.execPath} ${entry}`);
        }

        return { pid: child.pid, logPath, logStart };
      } finally {
        closeSync(fd);
      }
    },
    readLog: async (offset) =>
      readLogFrom(
        join((await (layout ??= loadDataHome(env))).logsDir, 'server.log'),
        offset,
      ),
    isAlive(pid) {
      try {
        process.kill(pid, 0);

        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM';
      }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
}

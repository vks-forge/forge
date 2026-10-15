/**
 * The real spawn, log, process and HTTP code behind `forge start | status | stop`.
 *
 * Why: the unit tests prove the commands' decisions on a scripted machine; this proves the
 *   machine adapter itself with a real detached child: that `start` leaves a process running
 *   with its output in `<dataHome>/logs/server.log`, that a second `start` does not spawn
 *   another, that `stop` sends the token over real HTTP and the process really ends, that a
 *   child that dies at once leaves its own words in the log for the user, that a missing
 *   build is reported before anything is spawned, and that an unrelated program on a port is
 *   never taken for Forge.
 *
 * Pins: start/status/start/stop/status lifecycle against a child process; failing child;
 *   missing entry; health classification (forge, other JSON, non-JSON, closed port);
 *   default entry path.
 * Depends on: src/services/{node-daemon-ports,daemon/*}, helpers/fake-server.ts. IO: child
 *   processes, loopback sockets, temp files.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findServer, readServerRecord } from '#/services/daemon/find-server.js';
import { serverStatus } from '#/services/daemon/server-status.js';
import { startServer } from '#/services/daemon/start-server.js';
import { stopServer } from '#/services/daemon/stop-server.js';
import {
  createNodeDaemonPorts,
  defaultServerEntry,
} from '#/services/node-daemon-ports.js';
import type { DaemonPorts } from '#/types/daemon.types.js';

const FAKE = fileURLToPath(new URL('../helpers/fake-server.ts', import.meta.url));
const TOKEN = 'T'.repeat(43);

let home: string;
let out: string[];
let err: string[];
const servers: Server[] = [];

function portsFor(env: Record<string, string> = {}): DaemonPorts {
  return createNodeDaemonPorts(
    { stdout: (t) => void out.push(t), stderr: (t) => void err.push(t) },
    { ...process.env, FORGE_HOME: home, FORGE_SERVER_ENTRY: FAKE, ...env },
  );
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'forge-daemon-'));
  writeFileSync(join(home, 'install-token'), `${TOKEN}\n`);
  out = [];
  err = [];
});

afterEach(async () => {
  const record = await readServerRecord(portsFor());
  // A test may record this very process as the server; never kill the test worker.
  if (record && record.pid !== process.pid && portsFor().isAlive(record.pid)) {
    process.kill(record.pid);
  }

  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
});

async function listening(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return (server.address() as { port: number }).port;
}

describe('the daemon commands against a real child process', () => {
  it('starts detached, is found, is not started twice, and stops cleanly', async () => {
    const ports = portsFor();

    const first = await startServer(ports, { open: false });
    const started = await readServerRecord(ports);
    const again = await startServer(ports, { open: false });
    const status = await serverStatus(ports);

    expect(first).toBe(0);
    expect(started).toBeDefined();
    expect(ports.isAlive(started?.pid ?? 0)).toBe(true);
    expect(out.join('')).toContain(`http://127.0.0.1:${started?.port}`);
    expect(again).toBe(0);
    expect(out.join('')).toContain('already running');
    expect((await readServerRecord(ports))?.pid).toBe(started?.pid);
    expect(status).toBe(0);
    expect(readFileSync(join(home, 'logs', 'server.log'), 'utf8')).toContain(
      'fake forge server listening',
    );

    const stopped = await stopServer(ports);

    expect(stopped).toBe(0);
    expect(ports.isAlive(started?.pid ?? 0)).toBe(false);
    expect(existsSync(join(home, 'server.json'))).toBe(false);
    expect(await serverStatus(ports)).toBe(3);
  }, 60_000);

  it('shows the child`s own words when it dies while starting', async () => {
    const ports = portsFor({ FAKE_SERVER_MODE: 'fail' });

    const code = await startServer(ports, { open: false });

    expect(code).toBe(1);
    expect(err.join('')).toContain('already in use by another program');
    expect(err.join('')).toContain('FORGE_PORT');
  }, 60_000);

  it('does not show an earlier start`s log lines', async () => {
    const ports = portsFor({ FAKE_SERVER_MODE: 'fail' });
    await startServer(ports, { open: false });
    err.length = 0;
    writeFileSync(
      join(home, 'logs', 'server.log'),
      'a long earlier history\n'.repeat(5),
      {
        flag: 'a',
      },
    );

    await startServer(ports, { open: false });

    expect(err.join('')).not.toContain('earlier history');
    expect(err.join('')).toContain('already in use');
  }, 60_000);

  it('reports a server that is not built before spawning anything', async () => {
    const ports = portsFor({ FORGE_SERVER_ENTRY: join(home, 'nope', 'main.js') });

    await expect(startServer(ports, { open: false })).rejects.toThrow(
      /not built.*pnpm build/,
    );

    expect(existsSync(join(home, 'logs'))).toBe(false);
  });
});

describe('health classification', () => {
  it('knows Forge, other JSON, non-JSON and nothing', async () => {
    const forge = await listening((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ service: 'forge', status: 'ok' }));
    });

    const degraded = await listening((_req, res) => {
      res.statusCode = 503;
      res.end(JSON.stringify({ service: 'forge', status: 'degraded' }));
    });

    const other = await listening((_req, res) => res.end(JSON.stringify({ hello: 1 })));
    const html = await listening((_req, res) => res.end('<html></html>'));
    const closed = await listening((_req, res) => res.end());
    await new Promise((r) => servers.pop()?.close(r));
    const ports = portsFor();

    expect(await ports.health(forge)).toBe('ok');
    expect(await ports.health(degraded)).toBe('degraded');
    expect(await ports.health(other)).toBe('not_forge');
    expect(await ports.health(html)).toBe('not_forge');
    expect(await ports.health(closed)).toBe('unreachable');
  });

  it('never sends the install token to a program that is not the recorded Forge', async () => {
    writeFileSync(
      join(home, 'server.json'),
      JSON.stringify({
        pid: process.pid,
        port: await listening((_req, res) => res.end('<html></html>')),
        startedAt: new Date().toISOString(),
        version: 'x',
      }),
    );

    const state = await findServer(portsFor());
    const code = await stopServer(portsFor());

    expect(state.kind).toBe('unresponsive');
    expect(code).toBe(1);
    expect(err.join('')).not.toContain(TOKEN);
  });
});

describe('defaultServerEntry', () => {
  it('points at the server app`s built main.js, next to this app', () => {
    expect(defaultServerEntry().replaceAll('\\', '/')).toMatch(
      /apps\/server\/dist\/main\.js$/,
    );
  });
});

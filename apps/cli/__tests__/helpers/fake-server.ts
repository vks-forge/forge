/**
 * A stand-in for the Forge server process, run as a real child by the daemon tests.
 *
 * Why: the CLI starts the server as a detached program and finds it only through
 *   `server.json`, `/health` and `/admin/shutdown`. To test the real spawn, log file,
 *   process-table and HTTP code without building the whole server, this script does just that
 *   contract: it listens on a free loopback port, publishes `server.json`, answers `/health`
 *   as Forge does, honours `POST /admin/shutdown` for the install token in the data home
 *   (202, then removes the record and exits), and in `fail` mode prints the server's own
 *   "port in use" line and exits 1 like a server that lost the port.
 *
 * Exports: none (executable, started with `node`).
 * Depends on: node:http, node:fs, node:path. IO: loopback socket, files in FORGE_HOME.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const home = process.env['FORGE_HOME'] ?? '';

if (process.env['FAKE_SERVER_MODE'] === 'fail') {
  process.stderr.write(
    'forge-server: port 4310 on 127.0.0.1 is already in use by another program; stop it or set FORGE_PORT to a free port\n',
  );

  process.exit(1);
}

const token = readFileSync(join(home, 'install-token'), 'utf8').trim();
const recordPath = join(home, 'server.json');

const server = createServer((req, res) => {
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'GET' && req.url === '/health') {
    json(200, { service: 'forge', status: 'ok' });

    return;
  }

  if (req.method === 'POST' && req.url === '/admin/shutdown') {
    if (req.headers.authorization !== `Bearer ${token}`) {
      json(401, { error: { code: 'unauthorized' } });

      return;
    }

    res.once('finish', () => {
      server.close();
      rmSync(recordPath, { force: true });
      setTimeout(() => process.exit(0), 100);
    });

    json(202, { status: 'stopping' });

    return;
  }

  json(404, {});
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  mkdirSync(home, { recursive: true });
  writeFileSync(
    recordPath,
    JSON.stringify({
      pid: process.pid,
      port,
      startedAt: new Date().toISOString(),
      version: 'fake',
    }),
  );

  process.stderr.write(`fake forge server listening on ${port}\n`);
});

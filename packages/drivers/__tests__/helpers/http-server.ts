/**
 * In-process Forge server stand-in for hook client tests.
 *
 * Why: the hook's whole job is to turn an HTTP answer (or the lack of one) into an exit
 *   code, so tests need a real socket they can make answer, hang, error or vanish.
 *
 * Exports: startServer(), Reply.
 * Depends on: node:http. IO: listens on 127.0.0.1 with an ephemeral port.
 */

import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';

export interface Reply {
  readonly status?: number;
  readonly body?: string;
  /** Do not answer for this many ms. */
  readonly delayMs?: number;
}

export interface TestServer {
  readonly url: string;
  readonly seen: { path: string; headers: IncomingHttpHeaders; body: string }[];
  close(): Promise<void>;
}

export async function startServer(reply: Reply): Promise<TestServer> {
  const seen: TestServer['seen'] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += String(c)));
    req.on('end', () => {
      seen.push({ path: req.url ?? '', headers: req.headers, body });
      setTimeout(() => {
        res.statusCode = reply.status ?? 200;
        res.end(reply.body ?? '');
      }, reply.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

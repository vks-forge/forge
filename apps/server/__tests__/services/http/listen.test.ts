/**
 * Binding: loopback only, a typed refusal for anything else, bounded close.
 *
 * Why: the API is unauthenticated (d-0036), so the only thing keeping it private is the
 *   bind address. Any host other than 127.0.0.1 must be refused with a typed error before a
 *   socket exists, and closing must not hang on a client that keeps a connection open.
 *
 * Pins: BindRefusedError for 0.0.0.0, localhost, ::1 and empty; port 0 yields a real port; keep-alive above the client pool's reuse window;
 *   close drops a lingering connection.
 * Depends on: src/services/http/listen. IO: loopback sockets.
 */

import { createServer } from 'node:http';
import { connect } from 'node:net';
import { ForgeError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  BindRefusedError,
  assertLoopbackBind,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  closeServer,
  listen,
} from '#/services/http/listen.js';

describe('assertLoopbackBind', () => {
  it('accepts 127.0.0.1', () => {
    expect(() => assertLoopbackBind('127.0.0.1')).not.toThrow();
  });

  it.each(['0.0.0.0', 'localhost', '::1', '::', '192.168.1.5', ''])(
    'refuses %j with a typed policy error',
    (host) => {
      try {
        assertLoopbackBind(host);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BindRefusedError);
        expect(error).toBeInstanceOf(ForgeError);
        expect((error as BindRefusedError).errorFamily).toBe('policy_denied');
      }
    },
  );
});

describe('listen and closeServer', () => {
  it('refuses a non-loopback host without opening a socket', async () => {
    const server = createServer();

    await expect(listen(server, '0.0.0.0', 0)).rejects.toBeInstanceOf(BindRefusedError);
    expect(server.listening).toBe(false);
  });

  it('binds port 0 to a real port and closes even with an idle connection open', async () => {
    const server = createServer((_req, res) => res.end('ok'));
    const port = await listen(server, '127.0.0.1', 0);
    const socket = connect(port, '127.0.0.1');
    await new Promise((resolve) => socket.once('connect', resolve));

    expect(port).toBeGreaterThan(0);
    await closeServer(server, 100);
    expect(server.listening).toBe(false);
    socket.destroy();
  });

  it('keeps idle connections for longer than a pooled client reuses them', async () => {
    const server = createServer();
    await listen(server, '127.0.0.1', 0);

    // Node's 5 s default closes a pooled socket just as a client reuses it: a reset.
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(server.keepAliveTimeout).toBeGreaterThanOrEqual(60_000);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
    await closeServer(server, 100);
  });

  it('treats closing a server that never listened as a no-op', async () => {
    await expect(closeServer(createServer())).resolves.toBeUndefined();
  });

  it('rejects when the port is taken', async () => {
    const first = createServer();
    const port = await listen(first, '127.0.0.1', 0);

    await expect(listen(createServer(), '127.0.0.1', port)).rejects.toThrow();
    await closeServer(first, 100);
  });
});

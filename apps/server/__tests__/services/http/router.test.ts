/**
 * The router: matching, parameters, 404/405, the Host guard and error handling.
 *
 * Why: the router is the only gate in front of an unauthenticated local API. It must pick
 *   the right handler, decode path parameters safely, say 405 (with `Allow`) instead of a
 *   misleading 404 for a wrong method, refuse a Host header that is not loopback (DNS
 *   rebinding), never leak a handler's exception text, and set no CORS header.
 *
 * Pins: exact-segment matching, `:param` decoding, 404/405/403 bodies, 500 hides the message.
 * Depends on: src/services/http/router, helpers/http-rig. IO: a loopback socket.
 */

import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isLoopbackHost } from '#/services/http/router.js';
import { sendJson } from '#/services/http/respond.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';

let rig: HttpRig;

beforeAll(async () => {
  rig = await startHttp([
    {
      method: 'GET',
      path: '/things/:id',
      handle: async ({ res, params }) => sendJson(res, 200, { id: params['id'] }),
    },
    {
      method: 'POST',
      path: '/things/:id',
      handle: async ({ res }) => sendJson(res, 201, { ok: true }),
    },
    {
      method: 'GET',
      path: '/boom',
      handle: async () => {
        throw new Error('secret-token-123 leaked in a stack');
      },
    },
  ]);
});

afterAll(async () => {
  await rig.close();
});

describe('router', () => {
  it('passes decoded path parameters to the handler', async () => {
    const res = await rig.json('GET', '/things/a%20b');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'a b' });
  });

  it('answers 404 for an unknown path and for an empty parameter', async () => {
    const unknown = await rig.json('GET', '/nope');
    const empty = await rig.json('GET', '/things/');

    expect(unknown.status).toBe(404);
    expect(empty.status).toBe(404);
  });

  it('answers 404 for a malformed percent escape instead of throwing', async () => {
    const res = await rig.json('GET', '/things/%E0%A4%A');

    expect(res.status).toBe(404);
  });

  it('answers 405 with the allowed methods for a known path', async () => {
    const res = await rig.json('DELETE', '/things/1');

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });

  it('never echoes an unexpected error and sets no CORS header', async () => {
    const res = await rig.json('GET', '/boom');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret-token');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses a request whose Host header is not loopback', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const port = Number(new URL(rig.url).port);
      const req = request(
        { host: '127.0.0.1', port, path: '/things/1', headers: { host: 'evil.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );

      req.on('error', reject);
      req.end();
    });

    expect(status).toBe(403);
  });
});

describe('isLoopbackHost', () => {
  it('accepts loopback names with or without a port and nothing else', () => {
    expect(isLoopbackHost('127.0.0.1:4310')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('[::1]:80')).toBe(true);
    expect(isLoopbackHost('127.0.0.1.evil.example')).toBe(false);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
  });
});

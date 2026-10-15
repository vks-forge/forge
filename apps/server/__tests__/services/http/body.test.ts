/**
 * JSON body reading: size limit, media type, syntax and schema errors.
 *
 * Why: the body is the first untrusted input. A client that streams without a
 *   `Content-Length`, lies about it, sends the wrong media type, sends broken JSON or sends
 *   valid JSON of the wrong shape must each get a distinct, safe 4xx, never a crash and
 *   never a half-parsed object reaching the engine.
 *
 * Pins: 413 on declared and on streamed overflow, 415, 400 invalid JSON, 400 with zod issues.
 * Depends on: src/services/http/body, helpers/http-rig. IO: a loopback socket.
 */

import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readJson, readBody, readJsonValue } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';

const Shape = z.object({ name: z.string(), count: z.number().int() });
let rig: HttpRig;

beforeAll(async () => {
  rig = await startHttp([
    {
      method: 'POST',
      path: '/shape',
      handle: async ({ req, res }) => sendJson(res, 200, await readJson(req, Shape)),
    },
    {
      method: 'POST',
      path: '/small',
      handle: async ({ req, res }) =>
        sendJson(res, 200, { length: (await readBody(req, 16)).length }),
    },
    {
      method: 'POST',
      path: '/any',
      handle: async ({ req, res }) =>
        sendJson(res, 200, { value: await readJsonValue(req) }),
    },
  ]);
});

afterAll(async () => {
  await rig.close();
});

describe('readJson', () => {
  it('returns the parsed value for a valid body', async () => {
    const res = await rig.json('POST', '/shape', { name: 'a', count: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'a', count: 2 });
  });

  it('accepts a charset on the media type', async () => {
    const res = await rig.json(
      'POST',
      '/shape',
      { name: 'a', count: 2 },
      {
        'content-type': 'application/json; charset=utf-8',
      },
    );

    expect(res.status).toBe(200);
  });

  it('lists the failing fields on a schema error', async () => {
    const res = await rig.json('POST', '/shape', { name: 1, count: 'x' });
    const issues = (res.body as { error: { issues: { path: string }[] } }).error.issues;

    expect(res.status).toBe(400);
    expect(issues.map((i) => i.path).sort()).toEqual(['count', 'name']);
  });

  it('answers 400 for syntactically invalid JSON', async () => {
    const res = await rig.json('POST', '/shape', '{not json');

    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('invalid_json');
  });

  it('answers 415 when the media type is not JSON', async () => {
    const res = await rig.json('POST', '/shape', '{}', { 'content-type': 'text/plain' });

    expect(res.status).toBe(415);
  });

  it('answers 413 for a body that declares more than one MiB, without reading it', async () => {
    // Declared, not sent: pushing the real megabytes races the server closing the socket
    // after the 413 and shows up as a client-side reset (flaky), not as a status.
    expect(await rig.declaredStatus('/shape', 1024 * 1024 + 10)).toBe(413);
  });
});

describe('readBody', () => {
  it('stops a chunked body that crosses the limit without a Content-Length', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const port = Number(new URL(rig.url).port);
      const req = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/small',
          headers: rig.authHeaders,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );

      req.on('error', reject);
      req.write('a'.repeat(10));
      req.write('b'.repeat(10));
      req.end();
    });

    expect(status).toBe(413);
  });

  it('reads a body inside the limit', async () => {
    const res = await rig.json('POST', '/small', '"hi"');

    expect(res.body).toEqual({ length: 4 });
  });
});

describe('readJsonValue', () => {
  it('returns any JSON value without checking its shape', async () => {
    const res = await rig.json('POST', '/any', [1, 'two']);

    expect(res.body).toEqual({ value: [1, 'two'] });
  });
});

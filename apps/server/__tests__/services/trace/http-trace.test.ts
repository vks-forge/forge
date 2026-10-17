/**
 * HTTP trace: one entry per request, bodies of mutations only, errors with their family.
 *
 * Why: the owner's clicks arrive as HTTP calls, so the request line (method, path, status,
 *   duration, actor) is the first link in a card's story, and the body of a mutation (the chat
 *   message, the answer) says what was asked (d-0163). GET bodies are not logged, nothing
 *   under `/auth` is (it carries sign-in codes), the query string is reduced to its key names
 *   (SSE tickets travel there), and a Worker's hook call is a `tool` entry with the verdict it
 *   got back. Reading the body for the trace must not stop the route from reading it.
 *
 * Pins: GET has no body, POST body is logged and still readable by the handler, `/auth` body
 *   omitted, query values dropped, hook path is a worker `tool` entry with response, status and
 *   duration present, router errors become `error` entries with family and status.
 * Depends on: src/services/trace/http-trace, src/services/http/{body,router}, node:http, vitest.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TraceInput } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { readJsonValue } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { beginHttpTrace, traceRouterError } from '#/services/trace/http-trace.js';

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

async function start() {
  const entries: TraceInput[] = [];
  const trace = { emit: (e: TraceInput) => void entries.push(e) };
  let clock = 0;
  const seen: unknown[] = [];

  server = createServer((req, res) => {
    beginHttpTrace({ trace, now: () => (clock += 5) }, req, res);
    void (async () => {
      try {
        if (req.url?.startsWith('/boom')) {
          throw new HttpError(409, 'conflict', 'nope', { family: 'stall' });
        }

        if (req.method === 'POST') {
          seen.push(await readJsonValue(req));
        }

        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, verdict: 'allow' }));
      } catch (error) {
        traceRouterError({ trace }, error, req);
        res.statusCode = 409;
        res.end('{}');
      }
    })();
  });

  await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
  const settle = () => new Promise((r) => setTimeout(r, 30));

  return { base, entries, seen, settle };
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('http trace', () => {
  it('logs a GET with method, path, status and duration but no body, and drops query values', async () => {
    const { base, entries, settle } = await start();

    await fetch(`${base}/cards?ticket=SECRET-TICKET&limit=5`);
    await settle();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'http', actor: 'owner' });
    expect(entries[0]?.message).toBe('GET /cards 200');
    expect(entries[0]?.data).toMatchObject({
      method: 'GET',
      path: '/cards',
      status: 200,
      query_keys: ['ticket', 'limit'],
    });

    expect((entries[0]?.data as { duration_ms: number }).duration_ms).toBeGreaterThan(0);
    expect(JSON.stringify(entries[0])).not.toContain('SECRET-TICKET');
    expect(entries[0]?.data).not.toHaveProperty('body');
  });

  it('logs a mutation body and leaves it readable for the handler', async () => {
    const { base, entries, seen, settle } = await start();

    await post(`${base}/cards/FG-C1/messages`, { text: 'please add a button' });
    await settle();

    expect(seen).toEqual([{ text: 'please add a button' }]);
    expect(entries[0]?.data).toMatchObject({
      method: 'POST',
      body: { text: 'please add a button' },
    });
  });

  it('omits the body of anything under /auth', async () => {
    const { base, entries, settle } = await start();

    await post(`${base}/auth/open`, { code: 'ONE-TIME-CODE' });
    await settle();

    expect(JSON.stringify(entries)).not.toContain('ONE-TIME-CODE');
    expect(entries[0]?.data).toMatchObject({ body: '[omitted]' });
  });

  it('logs a worker hook call as a tool entry on the run, with the verdict', async () => {
    const { base, entries, settle } = await start();

    await post(`${base}/runs/run-7/hook`, { tool: 'Bash', input: { command: 'ls' } });
    await settle();

    expect(entries[0]).toMatchObject({ kind: 'tool', actor: 'worker', run_id: 'run-7' });
    expect(entries[0]?.data).toMatchObject({
      body: { tool: 'Bash' },
      response: { verdict: 'allow' },
    });
  });

  it('logs a router error with its family and status', async () => {
    const { base, entries, settle } = await start();

    await fetch(`${base}/boom`);
    await settle();

    const error = entries.find((e) => e.kind === 'error');

    expect(error).toMatchObject({ level: 'warn', actor: 'server' });
    expect(error?.data).toMatchObject({ family: 'stall', status: 409, path: '/boom' });
  });
});

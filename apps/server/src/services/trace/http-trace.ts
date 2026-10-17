/**
 * HTTP side of the debug trace: one entry per request and one per error that reaches the router.
 *
 * Why: the owner's clicks and the Workers' hook calls are HTTP, so the request line (method,
 *   path, status, duration, who) is the first link in a card's story, and the body of a
 *   mutation (the chat message, the answer, the settings change) says what was asked (d-0163).
 *   GET bodies are not logged, nothing under `/auth` is (it carries sign-in codes), and the
 *   query string is reduced to its key names because SSE tickets travel there. A Worker's
 *   `/runs/:id/hook` call is the tool-call door, so it is logged as a `tool` entry on the run
 *   with the verdict it got back. The body is teed from the request's own iterator, so the
 *   route still reads it normally; bodies over 64 KiB are cut for the trace only.
 *
 * Exports: beginHttpTrace(), traceRouterError().
 * Depends on: node:http (types), @forge/core (ForgeError, TraceSink). No IO of its own.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { ForgeError } from '@forge/core';
import type { TraceSink } from '@forge/core';

const BODY_LIMIT = 64 * 1024;
const NO_BODY = new Set(['GET', 'HEAD', 'OPTIONS']);

const stripApi = (path: string): string =>
  path === '/api' ? '/' : path.startsWith('/api/') ? path.slice(4) : path;

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** `hook PreToolUse Bash allow`: the Worker's tool call and the verdict it got. */
function hookMessage(sent: unknown, verdict: unknown, status: number): string {
  const body = (sent ?? {}) as { event?: unknown; payload?: { tool_name?: unknown } };
  const reply = (verdict ?? {}) as { decision?: unknown };

  return [
    'hook',
    text(body.event) ?? 'event',
    text(body.payload?.tool_name),
    text(reply.decision) ?? String(status),
  ]
    .filter(Boolean)
    .join(' ');
}

/** Patches `req` so the chunks a handler reads are also kept (up to the limit) for the trace. */
function teeBody(req: IncomingMessage): () => string {
  const kept: Buffer[] = [];
  let size = 0;
  const original = req[Symbol.asyncIterator].bind(req);
  (req as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator] =
    async function* () {
      for await (const chunk of original()) {
        const part = Buffer.from(chunk as Uint8Array);
        if (size < BODY_LIMIT) {
          kept.push(part);
          size += part.length;
        }

        yield chunk;
      }
    };

  return () => Buffer.concat(kept).toString('utf8').slice(0, BODY_LIMIT);
}

/** Keeps what `res.end` is given, so the trace can show a hook's verdict. */
function teeResponse(res: ServerResponse): () => string {
  const kept: Buffer[] = [];
  const end = res.end.bind(res) as (...args: unknown[]) => ServerResponse;
  (res as { end: unknown }).end = (...args: unknown[]) => {
    const chunk = args[0];
    if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
      kept.push(Buffer.from(chunk));
    }

    return end(...args);
  };

  return () => Buffer.concat(kept).toString('utf8').slice(0, BODY_LIMIT);
}

/** Starts tracing `req`; the entry is emitted when the response closes. Never throws. */
export function beginHttpTrace(
  deps: { trace: TraceSink; now: () => number },
  req: IncomingMessage,
  res: ServerResponse,
): void {
  try {
    const started = deps.now();
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = stripApi(url.pathname);
    const hook = /^\/runs\/([^/]+)\/hook$/.exec(path);
    const hidden = path === '/auth' || path.startsWith('/auth/');
    const body = !NO_BODY.has(method) && !hidden ? teeBody(req) : undefined;
    const response = hook ? teeResponse(res) : undefined;

    res.once('close', () => {
      try {
        const status = res.statusCode;
        const sent = body?.() ?? '';
        const sentBody = sent === '' ? undefined : parse(sent);
        const verdict = response ? parse(response()) : undefined;
        deps.trace.emit({
          level: NO_BODY.has(method) && status < 400 ? 'debug' : 'info',
          kind: hook ? 'tool' : 'http',
          ...(hook?.[1] ? { run_id: hook[1] } : {}),
          actor: hook ? 'worker' : 'owner',
          message: hook
            ? hookMessage(sentBody, verdict, status)
            : `${method} ${path} ${status}`,
          data: {
            method,
            path,
            status,
            duration_ms: deps.now() - started,
            query_keys: [...url.searchParams.keys()],
            ...(hidden && !NO_BODY.has(method)
              ? { body: '[omitted]' }
              : sentBody === undefined
                ? {}
                : { body: sentBody }),
            ...(verdict === undefined ? {} : { response: verdict }),
          },
        });
      } catch {
        // Tracing must never break a request.
      }
    });
  } catch {
    // Tracing must never break a request.
  }
}

/** Records an error the router is about to turn into a response. Never throws. */
export function traceRouterError(
  deps: { trace: TraceSink },
  error: unknown,
  req: IncomingMessage,
): void {
  try {
    const status = (error as { status?: unknown }).status;
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    deps.trace.emit({
      level: typeof status === 'number' && status < 500 ? 'warn' : 'error',
      kind: 'error',
      actor: 'server',
      message: `${req.method ?? 'GET'} ${stripApi(url.pathname)} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      data: {
        method: req.method,
        path: stripApi(url.pathname),
        status: typeof status === 'number' ? status : 500,
        family: error instanceof ForgeError ? error.errorFamily : 'unknown',
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      },
    });
  } catch {
    // Tracing must never break a request.
  }
}

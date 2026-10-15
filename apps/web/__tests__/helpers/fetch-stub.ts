/**
 * `stubFetch()`: a route table standing in for the Forge server, at the `fetch` boundary.
 *
 * Why: the web app talks only to the real server API (d-0123), so component tests must not
 *   need a running server and must not swap in a fake data layer either. They stub `fetch`
 *   itself: the real http adapter, schemas and screens run unchanged, and the test decides
 *   what the "server" answers. A route is `'METHOD /path/:param'` (path as the adapter
 *   sees it, without `/api`) mapped to a response or a function that builds one from the
 *   request. A key may also carry a query (`'GET /runs?status=error'`), which then matches
 *   only that exact query. A function lets a route hold state (a saved version that then shows
 *   up in the history), `stub.use()` puts routes in front of the rest to stage a failure, a 409
 *   or a dead connection, and `delayMs` holds an answer to observe a write in flight. A request
 *   no route matches gets a loud 404 and is recorded, so a screen asking for something the
 *   test did not expect shows up as a failure, not as silence.
 *
 * Exports: stubFetch(), json(), refusal(), networkDown, sequence(), FetchStub, Routes,
 *   StubRequest, StubResponse, StubCall, RouteHandler.
 * Depends on: vitest (vi.stubGlobal). No network.
 */

import { vi } from 'vitest';

/** What a stubbed route answers: a JSON body with a status, or a dead connection. */
export type StubResponse =
  | {
      readonly status?: number;
      readonly body?: unknown;
      /** Hold the answer this long, to observe what the screen does while a write is in flight. */
      readonly delayMs?: number;
    }
  | { readonly networkError: true };

/** The request a route function sees. */
export interface StubRequest {
  readonly method: string;
  /** Path without the `/api` prefix, with the query string. */
  readonly path: string;
  readonly query: URLSearchParams;
  readonly params: Readonly<Record<string, string>>;
  /** The parsed JSON body; `undefined` when the request had none. */
  readonly body: unknown;
}

export type RouteHandler = (request: StubRequest) => StubResponse | Promise<StubResponse>;

/** `'GET /projects/:slug/memory'` to a fixed response or a function. */
export type Routes = Readonly<Record<string, StubResponse | RouteHandler>>;

export interface StubCall {
  readonly method: string;
  /** Path without the `/api` prefix, with the query string. */
  readonly path: string;
  readonly body: unknown;
  /** False when no route matched (the stub answered 404). */
  readonly matched: boolean;
}

export interface FetchStub {
  readonly fetch: typeof globalThis.fetch;
  /** Every request made, in order. */
  readonly calls: StubCall[];
  /**
   * Calls to a route: `'METHOD /path/:param'` matches by pattern, any other text matches the
   * start of `'METHOD path?query'`. All calls when no pattern is given.
   */
  callsTo(pattern?: string): StubCall[];
  /** Adds routes that win over the existing ones for the same method and path. */
  use(routes: Routes): void;
  /** Removes the stub from `globalThis` (the test setup also does this after every test). */
  restore(): void;
}

interface Compiled {
  readonly method: string;
  readonly regex: RegExp;
  readonly names: readonly string[];
  /** The key named a query, so it must equal the whole `path?query`. */
  readonly withQuery: boolean;
  readonly answer: StubResponse | RouteHandler;
}

const API_PREFIX = '/api';
const escapeText = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compilePattern(pattern: string): { regex: RegExp; names: string[] } {
  const names: string[] = [];
  const source = pattern
    .split(/(:[A-Za-z_]+)/)
    .map((part) => {
      if (/^:[A-Za-z_]+$/.test(part)) {
        names.push(part.slice(1));

        return '([^/?]+)';
      }

      return escapeText(part);
    })
    .join('');

  return { regex: new RegExp(`^${source}$`), names };
}

function compile(routes: Routes): Compiled[] {
  const all = Object.entries(routes).map(([key, answer]) => {
    const space = key.indexOf(' ');
    const pattern = key.slice(space + 1);
    const { regex, names } = compilePattern(pattern);

    return {
      method: key.slice(0, space),
      regex,
      names,
      withQuery: pattern.includes('?'),
      answer,
    };
  });

  // A route that names its query is more specific than one that does not.
  return [...all.filter((r) => r.withQuery), ...all.filter((r) => !r.withQuery)];
}

function match(
  routes: readonly Compiled[],
  method: string,
  pathname: string,
  full: string,
): { route: Compiled; params: Record<string, string> } | undefined {
  for (const route of routes) {
    const hit =
      route.method === method
        ? route.regex.exec(route.withQuery ? full : pathname)
        : null;

    if (hit) {
      const params = Object.fromEntries(
        route.names.map((name, index) => [
          name,
          decodeURIComponent(hit[index + 1] ?? ''),
        ]),
      );

      return { route, params };
    }
  }

  return undefined;
}

function toResponse(answer: StubResponse): Response {
  if ('networkError' in answer) {
    throw new TypeError('Failed to fetch (stubbed network error)');
  }

  return Response.json(answer.body ?? {}, { status: answer.status ?? 200 });
}

/**
 * Installs the stub as `globalThis.fetch`, so the app's own http adapter (which uses the
 * global fetch) talks to it with no injection; `stub.fetch` is the same function for code
 * that is handed a `fetch` explicitly.
 */
export function stubFetch(routes: Routes = {}): FetchStub {
  let table = compile(routes);
  const calls: StubCall[] = [];

  const stubbed = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://forge.test');
    const method = (init?.method ?? 'GET').toUpperCase();
    const pathname = url.pathname.startsWith(API_PREFIX)
      ? url.pathname.slice(API_PREFIX.length)
      : url.pathname;

    const path = `${pathname}${url.search}`;
    const text = typeof init?.body === 'string' ? init.body : undefined;
    const body: unknown = text === undefined ? undefined : JSON.parse(text);
    const found = match(table, method, pathname, path);
    calls.push({ method, path, body, matched: found !== undefined });
    if (!found) {
      return Response.json(
        {
          error: {
            code: 'no_stub_route',
            message: `The test stub has no route for ${method} ${path}.`,
          },
        },
        { status: 404 },
      );
    }

    const { answer } = found.route;
    const reply =
      typeof answer === 'function'
        ? await answer({
            method,
            path,
            query: url.searchParams,
            params: found.params,
            body,
          })
        : answer;

    if (!('networkError' in reply) && reply.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    }

    return toResponse(reply);
  }) as typeof globalThis.fetch;

  vi.stubGlobal('fetch', stubbed);

  return {
    fetch: stubbed,
    calls,
    callsTo: (pattern) => {
      if (pattern === undefined) {
        return [...calls];
      }

      if (!pattern.includes(':') || pattern.includes('?')) {
        return calls.filter((call) => `${call.method} ${call.path}`.startsWith(pattern));
      }

      const space = pattern.indexOf(' ');
      const { regex } = compilePattern(pattern.slice(space + 1));

      return calls.filter(
        (call) =>
          call.method === pattern.slice(0, space) && regex.test(call.path.split('?')[0]!),
      );
    },
    use(more) {
      table = [...compile(more), ...table];
    },
    restore: () => vi.unstubAllGlobals(),
  };
}

/** A 200 JSON answer. */
export const json = (body: unknown): StubResponse => ({ body });

/** The server's refusal shape, `{ error: { code, message } }`, with a status. */
export const refusal = (status: number, code: string, message = code): StubResponse => ({
  status,
  body: { error: { code, message } },
});

/** The connection fails before any answer, as when Forge is not running. */
export const networkDown: StubResponse = { networkError: true };

/** Answers each call with the next response; the last one repeats. */
export function sequence(...answers: StubResponse[]): RouteHandler {
  let index = 0;

  return () => {
    const answer = answers[Math.min(index, answers.length - 1)];
    index += 1;

    return answer ?? json({});
  };
}

/**
 * `createFetchStub()`: a route table of method and path to a JSON reply, recording every call.
 *
 * Why: the web app talks only to the real Forge API (d-0123), so screen tests stand in for the
 *   server at the one place the app reaches it, `fetch`. A test lists the routes it cares about,
 *   changes one mid-test (for example to make a write fail with 500), and asserts what the
 *   screen sent (paths, query strings, bodies). A call with no route answers 404 in the server's
 *   error shape, so a screen that asks for something the test did not expect fails loudly.
 *
 * Exports: createFetchStub(), FetchStub, StubCall, StubHandler, StubReply.
 * Depends on: nothing. No IO.
 */

export interface StubCall {
  readonly method: string;
  /** Path under the `/api` prefix, with the query string. */
  readonly path: string;
  readonly body: unknown;
}

export interface StubReply {
  readonly status?: number;
  readonly body?: unknown;
  /** Hold the answer this long, to observe what the screen does while a write is in flight. */
  readonly delayMs?: number;
}

export type StubHandler = StubReply | ((call: StubCall) => StubReply);

export interface FetchStub {
  readonly fetch: typeof globalThis.fetch;
  readonly calls: StubCall[];
  /** Adds or replaces a route; key is `METHOD /path` with or without `?query`. */
  set(key: string, handler: StubHandler): void;
  /** Calls whose `METHOD /path` starts with the given prefix. */
  callsTo(prefix: string): StubCall[];
}

export function createFetchStub(initial: Record<string, StubHandler> = {}): FetchStub {
  const routes = new Map(Object.entries(initial));
  const calls: StubCall[] = [];

  const fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'http://forge.test');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = `${url.pathname.replace(/^\/api/, '')}${url.search}`;
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;

    const call: StubCall = { method, path, body };
    calls.push(call);

    const handler =
      routes.get(`${method} ${path}`) ?? routes.get(`${method} ${path.split('?')[0]}`);

    const reply: StubReply =
      handler === undefined
        ? {
            status: 404,
            body: {
              error: { code: 'not_found', message: `no stub for ${method} ${path}` },
            },
          }
        : typeof handler === 'function'
          ? handler(call)
          : handler;

    const answer = (): Response =>
      new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });

    return reply.delayMs
      ? new Promise((resolve) => setTimeout(() => resolve(answer()), reply.delayMs))
      : Promise.resolve(answer());
  };

  return {
    fetch: fetch as typeof globalThis.fetch,
    calls,
    set: (key, handler) => void routes.set(key, handler),
    callsTo: (prefix) => calls.filter((c) => `${c.method} ${c.path}`.startsWith(prefix)),
  };
}

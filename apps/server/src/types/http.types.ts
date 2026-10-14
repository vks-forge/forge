/**
 * Shapes of the small HTTP layer: route table, route context, SSE sink.
 *
 * Why: the server uses `node:http` with an in-repo router (d-0061), so the contract
 *   between the router and the route handlers is ours to name. Handlers receive a parsed
 *   URL and path parameters and write through helpers, never touching raw sockets. The
 *   SSE sink is an interface so the replay-then-live logic can be tested without a socket.
 *
 * Exports: HttpMethod, RouteContext, RouteHandler, Route, Router, SseSink, ErrorIssue, ErrorBody.
 * Depends on: node:http. Types only.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export type HttpMethod = 'GET' | 'POST';

/** Everything a handler may read about the request. */
export interface RouteContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  /** Decoded `:name` segments of the matched path. */
  readonly params: Readonly<Record<string, string>>;
  readonly url: URL;
}

export type RouteHandler = (ctx: RouteContext) => Promise<void>;

export interface Route {
  readonly method: HttpMethod;
  /** Path with `:name` segments, e.g. `/tickets/:id`. */
  readonly path: string;
  readonly handle: RouteHandler;
}

export interface Router {
  /** Serves one request; never throws, every failure becomes a JSON error response. */
  dispatch(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

/** Where SSE frames go; `write` resolves once the chunk is flushed or the client is gone. */
export interface SseSink {
  write(chunk: string): Promise<void>;
}

/** One rejected field of a request. */
export interface ErrorIssue {
  readonly path: string;
  readonly message: string;
}

/** JSON body of every error response. */
export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly issues?: readonly ErrorIssue[];
  };
}

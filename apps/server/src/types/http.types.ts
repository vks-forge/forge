/**
 * Shapes of the small HTTP layer: route table, route context, SSE sink.
 *
 * Why: the server uses `node:http` with an in-repo router (d-0061), so the contract
 *   between the router and the route handlers is ours to name. Handlers receive a parsed
 *   URL and path parameters and write through helpers, never touching raw sockets. The
 *   SSE sink is an interface so the replay-then-live logic can be tested without a socket.
 *
 * Exports: HttpMethod, RouteContext, RouteHandler, Route, Router, RouterOptions, ApiServerOptions, HostPolicy, StaticUi,
 *   SseSink, ErrorIssue, ErrorBody.
 * Depends on: node:http, @forge/engine (Logger type), types/auth. Types only.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@forge/engine';
import type { RouteAccess } from '#/types/auth.types.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

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
  /** Who may call it; absent means the install token is required. */
  readonly access?: RouteAccess;
}

export interface Router {
  /** Serves one request; never throws, every failure becomes a JSON error response. */
  dispatch(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

/** Which `Host` headers the server answers. */
export interface HostPolicy {
  /** True when the header names this server: a loopback name on its own port. */
  allows(host: string | undefined): boolean;
}

/** The built web UI as the router sees it. */
export interface StaticUi {
  /** Serves the file at `pathname` when one exists; true when it answered. */
  serveFile(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<boolean>;
  /** Serves `index.html`, the answer for every client-side route. */
  serveIndex(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

/** Optional parts of a router; every default is the stricter choice. */
export interface RouterOptions {
  /** Defaults to any loopback name on any port; the server passes one pinned to its port. */
  readonly host?: HostPolicy;
  /** Absent means API only. */
  readonly ui?: StaticUi;
}

/** What the HTTP server is built with besides the route table. */
export interface ApiServerOptions {
  /** The built UI folder; undefined looks next to this app, null serves no UI. */
  readonly webRoot: string | null | undefined;
  /** The port the server is bound to, once it is. */
  readonly port: () => number | undefined;
  readonly log: Logger;
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

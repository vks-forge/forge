/**
 * Types of the API authentication layer and the single-instance files.
 *
 * Why: the router must ask "may this request reach this route" without knowing how tokens
 *   are stored or signed, and the install-token and lock code must run against a fake
 *   machine in tests (no icacls, no real pids). Naming the seams once keeps those services
 *   small and their tests about behaviour.
 *
 * Exports: RouteAccess, AuthRequest, AuthGuard, SseTicketIssuer, Auth, RestrictFile, InstanceLockIo,
 *   InstanceLock.
 * Depends on: none. Types only.
 */

/**
 * Who may call a route: `token` the install token (the default for every route), `open`
 * nobody needs to prove anything (`/health`) or the route checks its own secret
 * (`/runs/:id/hook`), `token_or_ticket` the install token or a signed SSE ticket for the
 * run in the path (browsers cannot set headers on an `EventSource`).
 */
export type RouteAccess = 'token' | 'open' | 'token_or_ticket';

/** What the guard looks at. */
export interface AuthRequest {
  readonly access: RouteAccess;
  /** The raw `Authorization` header. */
  readonly authorization: string | undefined;
  /** The `?ticket=` query value, only honoured for `token_or_ticket`. */
  readonly ticket: string | null;
  /** The run id in the path, which a ticket is bound to. */
  readonly runId: string | undefined;
}

export interface AuthGuard {
  /** True when the request may proceed. Never throws. */
  allows(request: AuthRequest): boolean;
}

/** Short-lived, run-bound credentials for `GET /runs/:id/events?ticket=`. */
export interface SseTicketIssuer {
  /** A ticket valid for `expiresInSeconds` for this run only. */
  issue(runId: string): { readonly ticket: string; readonly expiresInSeconds: number };
  verify(ticket: string, runId: string): boolean;
}

/** What the router and routes are built with: the access decision and the ticket issuer. */
export interface Auth {
  readonly guard: AuthGuard;
  readonly tickets: SseTicketIssuer;
}

/** Makes a file readable by the current user only; throws when it cannot. */
export type RestrictFile = (path: string) => Promise<void>;

/** The process facts the single-instance lock reads. */
export interface InstanceLockIo {
  readonly pid: number;
  /** True when a process with this pid exists. */
  isAlive(pid: number): boolean;
}

export interface InstanceLock {
  /** Removes the lock file if this process still owns it; never throws. */
  release(): Promise<void>;
}

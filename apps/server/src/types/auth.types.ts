/**
 * Types of the API authentication layer and the single-instance files.
 *
 * Why: the router must ask "may this request reach this route" without knowing how tokens
 *   are stored or signed, and the install-token and lock code must run against a fake
 *   machine in tests (no icacls, no real pids). Naming the seams once keeps those services
 *   small and their tests about behaviour.
 *
 * Exports: RouteAccess, AuthMethod, AuthRequest, AuthGuard, SseTicketIssuer, SessionStore,
 *   SessionVerifier, SessionRecord, TokenProver, Auth, RestrictFile, InstanceLockIo, InstanceLock.
 * Depends on: none. Types only.
 */

/**
 * Who may call a route: `token` the install token or a browser session (the default for
 * every route), `bearer` the install token only (it mints the one-time sign-in code, which
 * a session must not be able to do), `open` nobody needs to prove anything (`/health`) or
 * the route checks its own secret (`/runs/:id/hook`, `/auth/open`), `token_or_ticket` the
 * token, a session or a signed SSE ticket for the run in the path (browsers cannot set
 * headers on an `EventSource`).
 */
export type RouteAccess = 'token' | 'bearer' | 'open' | 'token_or_ticket';

/** How a request proved itself; the router adds the CSRF check for `session` only. */
export type AuthMethod = 'open' | 'bearer' | 'session' | 'ticket';

/** What the guard looks at. */
export interface AuthRequest {
  readonly access: RouteAccess;
  /** The raw `Authorization` header. */
  readonly authorization: string | undefined;
  /** The `?ticket=` query value, only honoured for `token_or_ticket`. */
  readonly ticket: string | null;
  /** The run id in the path, which a ticket is bound to. */
  readonly runId: string | undefined;
  /** The raw `Cookie` header, where the session cookie travels. */
  readonly cookie?: string | undefined;
}

export interface AuthGuard {
  /** How the request proved itself, or undefined when it may not proceed. Never throws. */
  authenticate(request: AuthRequest): AuthMethod | undefined;
  /** True when the request may proceed. Never throws. */
  allows(request: AuthRequest): boolean;
}

/** What the guard needs from the session store: is this cookie value a live session. */
export interface SessionVerifier {
  /** True for a live session; also slides its idle expiry. Never throws. */
  verify(sessionId: string): boolean;
}

/**
 * Browser sessions and the one-time codes that start them. Memory only: a restart signs
 * every browser out, which is the intended behaviour.
 */
export interface SessionStore extends SessionVerifier {
  /** A single-use code valid for `expiresInSeconds`. */
  issueCode(): { readonly code: string; readonly expiresInSeconds: number };
  /** Spends `code` (right or wrong, expired or not) and returns a new session id when it was good. */
  redeemCode(code: string): string | undefined;
  revoke(sessionId: string): void;
  /** Lifetime to put on the cookie. */
  readonly cookieMaxAgeSeconds: number;
}

/** Short-lived, run-bound credentials for `GET /runs/:id/events?ticket=`. */
export interface SseTicketIssuer {
  /** A ticket valid for `expiresInSeconds` for this run only. */
  issue(runId: string): { readonly ticket: string; readonly expiresInSeconds: number };
  verify(ticket: string, runId: string): boolean;
}

/** Shows knowledge of the install token without revealing it. */
export interface TokenProver {
  /** Lowercase hex `HMAC-SHA256(token, nonce)`. */
  prove(nonce: string): string;
}

/** What the router and routes are built with: the access decision and the ticket issuer. */
export interface Auth {
  readonly guard: AuthGuard;
  readonly prover: TokenProver;
  readonly tickets: SseTicketIssuer;
  readonly sessions: SessionStore;
}

/** One live browser session: when it goes idle, and the latest it can last. */
export interface SessionRecord {
  idleUntil: number;
  readonly hardUntil: number;
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

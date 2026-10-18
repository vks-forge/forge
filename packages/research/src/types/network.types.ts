/**
 * Network port types for the research providers.
 *
 * Why: the providers must run in tests with no network, no real DNS and no real sockets, and the
 *   SSRF guard must be provable with stubs. DNS, the pinned HTTP hop and the plain `fetch` used for
 *   the search endpoint are therefore named ports here; the production wiring (`node-network`) fills
 *   them in once, and a provider whose ports are missing refuses to run instead of silently using the
 *   ambient network. The guard's limits (allow and deny lists, timeout, byte cap) are the knobs a test
 *   or a caller turns.
 *
 * Exports: DnsResolver, HttpRequest, HttpResponse, HttpTransport, NetworkPorts, GuardOptions,
 *   FetchedText.
 * Depends on: No IO (types only).
 */

/** Resolves a host name to every address it points at (A and AAAA); `signal` is the call's time box. */
export type DnsResolver = (host: string, signal?: AbortSignal) => Promise<string[]>;

/** One already-validated hop: connect to `address`, not to whatever `url.hostname` resolves to later. */
export interface HttpRequest {
  url: URL;
  address: string;
  family: 4 | 6;
  signal: AbortSignal;
}

/** Streaming response; the caller enforces the byte cap and destroys the body. */
export interface HttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: AsyncIterable<Uint8Array> & { destroy(): unknown };
}

export type HttpTransport = (req: HttpRequest) => Promise<HttpResponse>;

/** Everything a provider touches outside the process. */
export interface NetworkPorts {
  readonly resolve: DnsResolver;
  readonly transport: HttpTransport;
  /** Plain `fetch`, used only for the search endpoint (redirects refused). */
  readonly fetch: typeof fetch;
}

export interface GuardOptions {
  resolve: DnsResolver;
  transport: HttpTransport;
  /** When non-empty, only these exact hosts (and ports 8080/8443 for them). */
  allowHosts: readonly string[];
  /** Always refused, subdomains included. */
  denyHosts?: readonly string[];
  timeoutMs: number;
  maxBytes: number;
}

export interface FetchedText {
  text: string;
  finalUrl: string;
  truncated: boolean;
  /** `<title>` of an HTML page, whitespace collapsed and capped; empty otherwise. */
  title: string;
  /** Bytes read from the body (at most `maxBytes`). */
  bytes: number;
  contentType: string;
  /** SHA-256 hex of the bytes read. */
  sha256: string;
}

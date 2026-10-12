/**
 * Types for the hook client's injected IO and its result.
 *
 * Why: the hook script must decide block-or-allow from only stdin, a config file and one
 *   HTTP call, and it must never crash into an exit code the harness reads as "allow".
 *   Passing IO in as a plain object lets tests drive every failure (server down, slow,
 *   garbage answer, missing file) in-process, and makes the exit code and the one stderr
 *   line the harness shows the Worker a returned value rather than a side effect.
 *
 * Exports: HookIo, HookResult, HookFetch, HookProcess.
 * Depends on: nothing. Types only.
 */

export type HookFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface HookIo {
  /** Entire stdin, already read. */
  readonly stdin: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** `process.argv.slice(2)`. */
  readonly argv: readonly string[];
  readonly fetch: HookFetch;
  readonly readFile: (path: string) => Promise<string>;
  /** Wall-clock ms, used as the request's `seq` ordering hint. */
  readonly now: () => number;
}

export interface HookResult {
  /** 0 allow, 2 block. Never 1: the harness treats other codes as non-blocking errors. */
  readonly exitCode: 0 | 2;
  readonly stdout: string;
  /** At most one line, newline-terminated, or ''. */
  readonly stderr: string;
}

/** The slice of `process` the entry point uses, so tests can drive it with fakes. */
export interface HookProcess {
  readonly stdin: AsyncIterable<unknown>;
  readonly stdout: { write(text: string, cb: () => void): unknown };
  readonly stderr: { write(text: string, cb: () => void): unknown };
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly argv: readonly string[];
}
